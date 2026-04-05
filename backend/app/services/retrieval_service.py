"""Retrieval service: query embedding → similarity search → rerank → return chunks."""
from __future__ import annotations

from app.config import get_settings
from app.models.schemas import SourceDoc
from app.services.embedding_service import get_embedding_service
from app.services.vector_store import get_vector_store
from app.utils.logger import setup_logger

logger = setup_logger(__name__)


def retrieve(
    question: str,
    tenant_id: str = "default",
    top_k: int | None = None,
) -> list[SourceDoc]:
    """
    Retrieve the most relevant chunks for a given question.

    Pipeline:
      1. Embed the question
      2. Similarity search in ChromaDB
      3. Filter by similarity threshold
    """
    settings = get_settings()
    k = top_k or 20  # fetch enough candidates, threshold determines actual count
    threshold = settings.SIMILARITY_THRESHOLD

    embedding_service = get_embedding_service()
    vector_store = get_vector_store()

    # Embed question
    query_embedding = embedding_service.embed_query(question)

    # Retrieve — ask Chroma for more candidates than we need so threshold filtering yields all that pass
    all_results = vector_store.query(
        query_embedding=query_embedding,
        n_results=k,
        tenant_id=tenant_id,
    )

    # No results at all
    if not all_results["documents"] or not all_results["documents"][0]:
        logger.info("No documents retrieved for query: %s", question[:80])
        return []

    source_docs: list[SourceDoc] = []
    for i, content in enumerate(all_results["documents"][0]):
        distance = all_results["distances"][0][i] if all_results.get("distances") else 1.0
        # ChromaDB returns L2 distance by default; lower is better
        # Convert to similarity score (0-1): 1 / (1 + distance)
        score = 1.0 / (1.0 + distance)

        if score < threshold:
            continue

        # Extract metadata
        metadata = all_results["metadatas"][0][i] if all_results.get("metadatas") else {}

        source_docs.append(
            SourceDoc(
                content=content,
                source=metadata.get("source", "unknown"),
                score=round(score, 4),
                page_number=metadata.get("page_number"),
            )
        )

    logger.info(
        "Retrieved %d chunks (threshold=%.2f) for query: %s",
        len(source_docs),
        threshold,
        question[:80],
    )

    return source_docs
