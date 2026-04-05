"""Document upload, listing, and deletion endpoints."""
from __future__ import annotations

import json
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel

from app.config import get_settings
from app.models.schemas import UploadResponse, DeleteDocumentsRequest
from app.services.ingestion_service import IngestionService
from app.services.vector_store import get_vector_store
from app.utils.logger import setup_logger

router = APIRouter(prefix="/documents", tags=["documents"])
logger = setup_logger(__name__)

# Guard against directory traversal in tenant_id
_TENANT_RE = re.compile(r"^[a-zA-Z0-9_\-]+$")

# 10 MB max upload per file
MAX_UPLOAD_BYTES = 10 * 1024 * 1024


def _safe_tenant_id(tenant_id: str) -> str:
    """Validate tenant_id to prevent directory traversal."""
    if not _TENANT_RE.match(tenant_id):
        raise HTTPException(status_code=400, detail="Invalid tenant_id")
    return tenant_id


def _registry_path(tenant_id: str) -> Path:
    """Path to the document registry JSON file."""
    p = Path(get_settings().UPLOAD_DIR) / tenant_id / ".registry.json"
    return p


def _load_registry(tenant_id: str = "default") -> list[dict]:
    p = _registry_path(tenant_id)
    if not p.exists():
        return []
    try:
        return json.loads(p.read_text())
    except (json.JSONDecodeError, ValueError):
        return []


def _save_registry(tenant_id: str, registry: list[dict]) -> None:
    p = _registry_path(tenant_id)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(registry, indent=2))


@router.get("/list")
async def list_documents(tenant_id: str = "default"):
    """List all ingested documents with chunk counts."""
    registry = _load_registry(tenant_id)
    return {"documents": registry}


@router.post("/upload", response_model=UploadResponse)
async def upload_documents(
    files: list[UploadFile] = File(...),
    tenant_id: str = Form(default="default"),
):
    """Upload one or more files for ingestion."""
    settings = get_settings()
    tenant_id = _safe_tenant_id(tenant_id)
    upload_dir = Path(settings.UPLOAD_DIR) / tenant_id
    upload_dir.mkdir(parents=True, exist_ok=True)

    ingestion = IngestionService()
    results: list[dict] = []

    for uploaded in files:
        ext = Path(uploaded.filename or "").suffix.lower()
        if ext not in (".pdf", ".txt", ".md", ".markdown", ".rst", ".csv"):
            raise HTTPException(
                status_code=400,
                detail="Unsupported file type. Supported: PDF, TXT, MD, Markdown, RST, CSV",
            )

        # Read with size guard
        content = await uploaded.read()
        if len(content) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="File too large (max 10MB)")

        file_path = upload_dir / f"{uuid.uuid4().hex}_{uploaded.filename}"
        file_path.write_bytes(content)

        try:
            result = ingestion.ingest_file(file_path=file_path, tenant_id=tenant_id)
            results.append(result)

            # Save to registry
            registry = _load_registry(tenant_id)
            registry.append({
                "document_id": result["document_id"],
                "filename": result["filename"],
                "chunks": result["chunks"],
                "source": "upload",
            })
            _save_registry(tenant_id, registry)
        except Exception as exc:
            logger.error("Ingestion failed for %s: %s", uploaded.filename, exc)
            raise HTTPException(status_code=500, detail="Failed to ingest file")
        finally:
            if file_path.exists():
                file_path.unlink()

    total_chunks = sum(r["chunks"] for r in results)
    doc_ids = [r["document_id"] for r in results]

    return UploadResponse(
        document_ids=doc_ids,
        message=f"Successfully ingested {len(doc_ids)} document(s)",
        total_chunks=total_chunks,
    )


_ALLOWED_SCHEMES = frozenset({"https:", "http:"})
_BLOCKED_HOSTS = frozenset({
    "localhost", "127.0.0.1", "0.0.0.0", "::1",
    "169.254.169.254",  # cloud metadata
})


def _safe_url(url: str) -> str:
    """Validate URL to prevent SSRF."""
    from urllib.parse import urlparse
    parsed = urlparse(url)
    if parsed.scheme not in _ALLOWED_SCHEMES:
        raise HTTPException(status_code=400, detail="Only http/https URLs allowed")
    hostname = parsed.hostname or ""
    if hostname in _BLOCKED_HOSTS:
        raise HTTPException(status_code=400, detail="URL not allowed")
    return url


@router.post("/upload/url")
async def upload_url(
    url: str = Form(...),
    tenant_id: str = Form(default="default"),
):
    """Ingest content from a URL."""
    tenant_id = _safe_tenant_id(tenant_id)
    _safe_url(url)

    ingestion = IngestionService()
    try:
        result = ingestion.ingest_url(url=url, tenant_id=tenant_id)
    except Exception as exc:
        logger.error("URL ingestion failed for %s: %s", url[:200], exc)
        raise HTTPException(status_code=500, detail="Failed to ingest URL")

    registry = _load_registry(tenant_id)
    registry.append({
        "document_id": result["document_id"],
        "filename": result.get("url", "URL"),
        "chunks": result["chunks"],
        "source": "url",
    })
    _save_registry(tenant_id, registry)

    return {
        "document_id": result["document_id"],
        "chunks": result["chunks"],
        "message": "URL ingested successfully",
    }


@router.delete("/delete/{document_id}")
async def delete_document(document_id: str, tenant_id: str = "default"):
    """Delete a single document from the vector store and registry."""
    tenant_id = _safe_tenant_id(tenant_id)
    vector_store = get_vector_store()
    deleted = vector_store.delete_by_document_ids([document_id], tenant_id)

    # Remove from registry
    registry = _load_registry(tenant_id)
    registry = [d for d in registry if d["document_id"] != document_id]
    _save_registry(tenant_id, registry)

    return {"deleted": deleted}


@router.delete("/delete")
async def delete_documents(body: DeleteDocumentsRequest):
    """Delete multiple documents by their IDs."""
    vector_store = get_vector_store()
    deleted = vector_store.delete_by_document_ids(body.document_ids)

    registry = _load_registry()
    registry = [d for d in registry if d["document_id"] not in body.document_ids]
    _save_registry(registry)

    return {"deleted": deleted, "message": f"Deleted {deleted} document(s)"}
