"""
Retrieval evaluation script — measures top-k recall for a test set.
Run: python evaluate.py --k 5
"""
from __future__ import annotations


def evaluate_retrieval(dataset: list[dict], k: int = 5) -> dict:
    """
    Evaluate retrieval precision/recall.

    dataset format:
      [
        {"query": "...", "relevant_doc_ids": ["id1", "id2"]},
        ...
      ]

    Returns precision@k, recall@k per document.
    """
    total_precision = 0.0
    total_recall = 0.0
    n = len(dataset)

    results: list[dict] = []
    for item in dataset:
        relevant = set(item["relevant_doc_ids"])
        # In practice, these would come from the retriever
        retrieved = set(item.get("retrieved_doc_ids", []))[:k]  # noqa

        if not relevant:
            continue

        hits = relevant & retrieved
        precision = len(hits) / k if k > 0 else 0
        recall = len(hits) / len(relevant)

        total_precision += precision
        total_recall += recall
        results.append({"query": item["query"], "precision": precision, "recall": recall})

    return {
        "precision_at_k": round(total_precision / n, 4) if n else 0,
        "recall_at_k": round(total_recall / n, 4) if n else 0,
        "total_queries": n,
        "results": results,
    }


if __name__ == "__main__":
    # Example test — replace with real dataset
    test_data = [
        {"query": "What is the company revenue?", "relevant_doc_ids": ["doc1"], "retrieved_doc_ids": ["doc1", "doc2"]},
    ]
    result = evaluate_retrieval(test_data, k=3)
    print(result)
