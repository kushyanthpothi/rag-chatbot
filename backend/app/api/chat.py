"""Chat query, session, and memory endpoints."""
from __future__ import annotations

import json
import time

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from app.config import get_settings
from app.models.schemas import QueryRequest, QueryResponse, SourceDoc
from app.services.llm_service import get_llm_service, SYSTEM_PROMPT
from app.services.memory_service import get_memory_service
from app.services.retrieval_service import retrieve
from app.services.vector_store import get_vector_store
from app.utils.logger import setup_logger

router = APIRouter(tags=["chat"])
logger = setup_logger(__name__)


def _has_documents(tenant_id: str) -> bool:
    """Check if any documents are indexed for this tenant."""
    return get_vector_store().count_documents(tenant_id) > 0


# ── Session Management ──────────────────────────────────────────────

@router.get("/chat/sessions")
async def list_sessions(tenant_id: str = Query(default="default")):
    """List all chat sessions for a tenant."""
    memory = get_memory_service()
    sessions = memory.list_sessions(tenant_id)
    return {"sessions": sessions}


@router.post("/chat/sessions")
async def create_session(tenant_id: str = Query(default="default")):
    """Create a new chat session and return its ID."""
    memory = get_memory_service()
    sid = memory.create_session(tenant_id)
    return {"session_id": sid}


@router.delete("/chat/sessions/{session_id}")
async def delete_session(session_id: str, tenant_id: str = Query(default="default")):
    """Delete a specific chat session."""
    memory = get_memory_service()
    deleted = memory.delete_session(tenant_id, session_id)
    return {"deleted": deleted}


@router.get("/chat/history")
async def get_chat_history(tenant_id: str = Query(default="default"), session_id: str = Query(default="")):
    """Retrieve messages for a specific session."""
    if not session_id:
        return {"messages": [], "session_id": ""}
    memory = get_memory_service()
    history = memory.get_session(tenant_id, session_id)
    return {"messages": [m.model_dump() for m in history], "session_id": session_id}


@router.delete("/chat/clear")
async def clear_chat_history(tenant_id: str = Query(default="default")):
    """Clear all chat sessions for a tenant."""
    memory = get_memory_service()
    count = memory.clear_all(tenant_id)
    return {"message": f"Cleared {count} session(s)"}


# ── Query ───────────────────────────────────────────────────────────

@router.post("/query", response_model=QueryResponse)
async def query(body: QueryRequest):
    """Ask a question — RAG if documents exist, otherwise direct LLM chat."""
    start = time.perf_counter()
    memory = get_memory_service()

    # Auto-create session if not provided
    session_id = body.session_id if hasattr(body, "session_id") and body.session_id else memory.create_session(body.tenant_id)
    history = memory.get_session(body.tenant_id, session_id)
    llm = get_llm_service()

    if _has_documents(body.tenant_id):
        # RAG mode
        sources = retrieve(body.question, tenant_id=body.tenant_id, top_k=body.top_k)
        if sources:
            answer = await llm.generate(body.question, sources=sources, chat_history=history)
            memory.add_message(body.tenant_id, session_id, {"role": "user", "content": body.question})
            memory.add_message(body.tenant_id, session_id, {"role": "assistant", "content": answer})
            latency = round((time.perf_counter() - start) * 1000, 1)
            logger.info("Query completed in %.1fms: %s", latency, body.question[:80])
            return QueryResponse(
                answer=answer,
                sources=sources,
                latency_ms=latency,
                tenant_id=body.tenant_id,
            )

    # Direct LLM chat (no documents or no relevant results)
    answer = await llm.generate_chat(body.question, chat_history=history)
    memory.add_message(body.tenant_id, session_id, {"role": "user", "content": body.question})
    memory.add_message(body.tenant_id, session_id, {"role": "assistant", "content": answer})

    latency = round((time.perf_counter() - start) * 1000, 1)
    logger.info("Chat query completed in %.1fms: %s", latency, body.question[:80])
    return QueryResponse(
        answer=answer,
        sources=[],
        latency_ms=latency,
        tenant_id=body.tenant_id,
    )


@router.post("/query/stream")
async def query_stream(body: QueryRequest):
    """Stream answer — RAG if documents exist, otherwise direct LLM chat."""
    memory = get_memory_service()
    session_id = body.session_id if hasattr(body, "session_id") and body.session_id else memory.create_session(body.tenant_id)
    history = memory.get_session(body.tenant_id, session_id)
    llm = get_llm_service()

    if _has_documents(body.tenant_id):
        sources = retrieve(body.question, tenant_id=body.tenant_id, top_k=body.top_k)
        if sources:
            return _rag_stream(body.question, sources, history, body.tenant_id, session_id)

    # Fallback: direct LLM chat streaming
    return _chat_stream(body.question, history, body.tenant_id, session_id)


def _rag_stream(question: str, sources: list[SourceDoc], history, tenant_id: str, session_id: str):
    """Stream RAG answer with sources."""
    llm = get_llm_service()

    async def _stream():
        full_answer = ""
        async for token in llm.generate_stream(question, sources=sources, chat_history=history):
            full_answer += token
            yield f"data: {json.dumps({'type': 'content', 'data': token})}\n\n"

        sources_payload = json.dumps({'type': 'sources', 'data': [s.model_dump() for s in sources]})
        yield f"data: {sources_payload}\n\n"
        yield "data: {\"type\":\"done\",\"data\":\"\"}\n\n"

        memory = get_memory_service()
        memory.add_message(tenant_id, session_id, {"role": "user", "content": question})
        memory.add_message(tenant_id, session_id, {"role": "assistant", "content": full_answer})

    return StreamingResponse(_stream(), media_type="text/event-stream")


def _chat_stream(question: str, history, tenant_id: str, session_id: str):
    """Stream direct LLM chat answer (no RAG)"""
    llm = get_llm_service()

    async def _stream():
        full_answer = ""
        async for token in llm.generate_chat_stream(question, chat_history=history):
            full_answer += token
            yield f"data: {json.dumps({'type': 'content', 'data': token})}\n\n"

        yield "data: {\"type\":\"sources\",\"data\":[]}\n\n"
        yield "data: {\"type\":\"done\",\"data\":\"\"}\n\n"

        memory = get_memory_service()
        memory.add_message(tenant_id, session_id, {"role": "user", "content": question})
        memory.add_message(tenant_id, session_id, {"role": "assistant", "content": full_answer})

    return StreamingResponse(_stream(), media_type="text/event-stream")
