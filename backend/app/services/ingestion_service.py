"""Document ingestion pipeline: parse → chunk → embed → store."""
from __future__ import annotations

import uuid
from pathlib import Path
from typing import Optional

from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.config import get_settings
from app.services.document_parser import get_parser
from app.services.embedding_service import get_embedding_service
from app.services.vector_store import get_vector_store
from app.utils.logger import setup_logger

logger = setup_logger(__name__)


class IngestionService:
    """Orchestrates the full document ingestion pipeline."""

    def __init__(self) -> None:
        self.settings = get_settings()
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=self.settings.CHUNK_SIZE,
            chunk_overlap=self.settings.CHUNK_OVERLAP,
            length_function=len,
            is_separator_regex=False,
        )
        self.embedding_service = get_embedding_service()
        self.vector_store = get_vector_store()

    def ingest_file(
        self,
        file_path: Path,
        tenant_id: str = "default",
    ) -> dict:
        """
        Process a single uploaded file through the full pipeline.
        Returns dict with document_id and chunk count.
        """
        logger.info("Ingesting file: %s for tenant: %s", file_path.name, tenant_id)

        # 1. Parse
        parser = get_parser(str(file_path))
        documents = parser.parse(file_path=file_path)

        # 2. Chunk
        chunks = self.text_splitter.split_documents(documents)

        # 3. Assign IDs + metadata
        document_id = str(uuid.uuid4())
        doc_ids = [f"{document_id}_{i}" for i in range(len(chunks))]

        texts = [c.page_content for c in chunks]
        metadatas = []
        for chunk in chunks:
            meta = chunk.metadata.copy()
            meta["document_id"] = document_id
            meta["tenant_id"] = tenant_id
            metadatas.append(meta)

        # 4. Embed
        embeddings = self.embedding_service.embed(texts)

        # 5. Store
        self.vector_store.add_documents(
            ids=doc_ids,
            documents=texts,
            embeddings=embeddings,
            metadatas=metadatas,
            tenant_id=tenant_id,
        )

        logger.info(
            "Ingested %s → %d chunks, doc_id=%s",
            file_path.name,
            len(chunks),
            document_id,
        )

        return {
            "document_id": document_id,
            "chunks": len(chunks),
            "filename": file_path.name,
        }

    def ingest_url(
        self,
        url: str,
        tenant_id: str = "default",
    ) -> dict:
        """Ingest content from a URL."""
        logger.info("Ingesting URL: %s for tenant: %s", url, tenant_id)

        parser = get_parser(url)
        documents = parser.parse(url=url)

        chunks = self.text_splitter.split_documents(documents)

        document_id = str(uuid.uuid4())
        doc_ids = [f"{document_id}_{i}" for i in range(len(chunks))]

        texts = [c.page_content for c in chunks]
        metadatas = []
        for chunk in chunks:
            meta = chunk.metadata.copy()
            meta["document_id"] = document_id
            meta["tenant_id"] = tenant_id
            metadatas.append(meta)

        embeddings = self.embedding_service.embed(texts)

        self.vector_store.add_documents(
            ids=doc_ids,
            documents=texts,
            embeddings=embeddings,
            metadatas=metadatas,
            tenant_id=tenant_id,
        )

        logger.info("Ingested URL %s → %d chunks", url, len(chunks))

        return {
            "document_id": document_id,
            "chunks": len(chunks),
            "url": url,
        }
