"""Health check endpoint."""
from __future__ import annotations

from fastapi import APIRouter

from app.config import get_settings
from app.models.schemas import HealthResponse
from app.services.vector_store import get_vector_store

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health():
    settings = get_settings()
    vector_store = get_vector_store()
    doc_count = vector_store.count_documents(settings.DEFAULT_TENANT)
    return HealthResponse(
        status="healthy",
        documents=doc_count,
        embedding_model=settings.EMBEDDING_MODEL,
        llm_model=settings.OPENROUTER_MODEL,
    )
