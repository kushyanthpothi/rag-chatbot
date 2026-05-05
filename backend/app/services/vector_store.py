"""Vector database service using ChromaDB with persistence and multi-tenant collections."""
from __future__ import annotations

import os
from typing import Optional

persist_directory = "/data/chroma"

# Suppress ChromaDB telemetry warnings
os.environ["ANONYMIZED_TELEMETRY"] = "False"

import chromadb
from chromadb.config import Settings as ChromaSettings

from app.config import get_settings
from app.services.embedding_service import get_embedding_service, EmbeddingService
from app.utils.logger import setup_logger

logger = setup_logger(__name__)


class VectorStore:
    """Thin wrapper around ChromaDB for CRUD operations."""

    def __init__(self) -> None:
        settings = get_settings()
        self.persist_dir = settings.CHROMA_PERSIST_DIR

        # Persistent client — stores on disk
        client = chromadb.PersistentClient(
            path=self.persist_dir,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
        self.client = client
        logger.info("ChromaDB initialized at %s", self.persist_dir)

    def get_or_create_collection(self, tenant_id: str) -> "chromadb.Collection":
        """Get or create a per-tenant collection."""
        embedding_service = get_embedding_service()
        if self.client.get_or_create_collection(tenant_id).count() == 0:
            logger.info("Created new chroma collection for tenant: %s", tenant_id)
        return self.client.get_or_create_collection(tenant_id)

    def add_documents(
        self,
        ids: list[str],
        documents: list[str],
        embeddings: list[list[float]],
        metadatas: list[dict],
        tenant_id: str,
    ) -> None:
        collection = self.get_or_create_collection(tenant_id)
        collection.add(ids=ids, documents=documents, embeddings=embeddings, metadatas=metadatas)
        logger.info("Added %d docs to collection %s", len(ids), tenant_id)

    def query(
        self,
        query_embedding: list[float],
        n_results: int,
        tenant_id: str,
    ) -> dict:
        collection = self.get_or_create_collection(tenant_id)
        return collection.query(query_embeddings=[query_embedding], n_results=n_results)

    def list_documents(self, tenant_id: str) -> list[dict]:
        """List all unique documents in ChromaDB with chunk counts."""
        collection = self.get_or_create_collection(tenant_id)
        results = collection.get(include=["metadatas"])
        if not results["metadatas"]:
            return []

        seen: dict[str, dict] = {}
        for meta in results["metadatas"]:
            doc_id = meta.get("document_id", "unknown")
            if doc_id not in seen:
                seen[doc_id] = {
                    "document_id": doc_id,
                    "filename": meta.get("source", "unknown"),
                    "file_type": meta.get("file_type", ""),
                    "chunks": 0,
                }
            seen[doc_id]["chunks"] += 1

        return sorted(seen.values(), key=lambda x: x["filename"])

    def delete_by_document_ids(self, document_ids: list[str], tenant_id: str) -> int:
        """Delete all chunks belonging to given document_ids."""
        collection = self.get_or_create_collection(tenant_id)
        # Chroma delete: need actual Chroma IDs — we use doc_id as metadata filter
        # Filter by metadata "document_id" using where clause
        for doc_id in document_ids:
            try:
                results = collection.get(
                    where={"document_id": doc_id},
                    include=["ids"],
                )
                if results["ids"]:
                    collection.delete(ids=results["ids"])
            except Exception:
                logger.warning("Failed to delete chunks for doc_id=%s", doc_id)
                continue
        logger.info("Deleted chunks for document_ids: %s from tenant=%s", document_ids, tenant_id)
        return len(document_ids)

    def count_documents(self, tenant_id: str) -> int:
        collection = self.get_or_create_collection(tenant_id)
        return collection.count()

    def list_document_ids(self, tenant_id: str) -> list[str]:
        """List all unique document IDs in a tenant's collection."""
        collection = self.get_or_create_collection(tenant_id)
        results = collection.get(include=["metadatas"])
        if not results["metadatas"]:
            return []
        return list({m["document_id"] for m in results["metadatas"]})

    def delete_collection(self, tenant_id: str) -> None:
        try:
            self.client.delete_collection(tenant_id)
        except Exception:
            pass


def get_vector_store() -> VectorStore:
    if not hasattr(get_vector_store, "_instance"):
        get_vector_store._instance = VectorStore()
    return get_vector_store._instance
