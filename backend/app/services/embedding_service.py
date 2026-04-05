"""Embedding service using sentence-transformers with batch processing."""
from __future__ import annotations

from typing import List

from sentence_transformers import SentenceTransformer

from app.config import get_settings
from app.utils.logger import setup_logger

logger = setup_logger(__name__)


class EmbeddingService:
    """Wraps sentence-transformers for consistent embedding generation."""

    def __init__(self) -> None:
        settings = get_settings()
        self.model_name = settings.EMBEDDING_MODEL
        self.batch_size = settings.EMBEDDING_BATCH_SIZE
        logger.info("Loading embedding model: %s", self.model_name)
        self.model = SentenceTransformer(self.model_name)
        logger.info("Embedding model loaded successfully")

    def embed(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for a list of texts."""
        if not texts:
            return []
        embeddings = self.model.encode(
            texts,
            batch_size=self.batch_size,
            show_progress_bar=False,
            convert_to_numpy=True,
        )
        return embeddings.tolist()

    def embed_query(self, text: str) -> list[float]:
        """Generate embedding for a single query."""
        return self.model.encode([text], convert_to_numpy=True)[0].tolist()

    @property
    def dimension(self) -> int:
        return self.model.get_sentence_embedding_dimension()  # type: ignore[return-value]


def get_embedding_service() -> EmbeddingService:
    # Singleton — reused across requests
    if not hasattr(get_embedding_service, "_instance"):
        get_embedding_service._instance = EmbeddingService()
    return get_embedding_service._instance
