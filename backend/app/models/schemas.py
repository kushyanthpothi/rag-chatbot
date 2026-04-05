"""Request/Response Pydantic models."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


# --- Upload ---
class UploadResponse(BaseModel):
    document_ids: list[str]
    message: str
    total_chunks: int


class DeleteDocumentsRequest(BaseModel):
    document_ids: list[str] = Field(..., description="Document IDs to delete")


# --- Query ---
class QueryRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    tenant_id: Optional[str] = Field(default="default", min_length=1)
    session_id: Optional[str] = Field(default="", description="Chat session ID")
    use_stream: bool = Field(default=False)
    top_k: Optional[int] = Field(default=None, ge=1, le=20)


class QueryResponse(BaseModel):
    answer: str
    sources: list[SourceDoc]
    latency_ms: float
    tenant_id: str


class SourceDoc(BaseModel):
    content: str
    source: str
    score: float
    page_number: Optional[int] = None


# --- Chat ---
class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatSession(BaseModel):
    tenant_id: str = "default"
    messages: list[ChatMessage] = Field(default_factory=list)


class ChatSessionInfo(BaseModel):
    session_id: str
    preview: str
    total_messages: int


# --- Health ---
class HealthResponse(BaseModel):
    status: str
    documents: int
    embedding_model: str
    llm_model: str


# --- Streaming chunk (SSE-like) ---
class StreamChunk(BaseModel):
    type: str  # "content" | "sources" | "done"
    data: str | list[SourceDoc]
