"""LLM service using OpenRouter API with streaming support."""
from __future__ import annotations

import os

# Suppress ChromaDB telemetry warnings before anything else
os.environ["ANONYMIZED_TELEMETRY"] = "False"

from typing import AsyncGenerator, Optional

from openai import AsyncOpenAI

from app.config import get_settings
from app.models.schemas import ChatMessage, SourceDoc
from app.utils.logger import setup_logger

logger = setup_logger(__name__)


# System prompt — instructs the model to use inline citations when sources are provided
SYSTEM_PROMPT = """\
You are a helpful, knowledgeable assistant. When provided with document excerpts
as context, cite your sources using bracketed numbers like [1], [2], [3].

CITATION RULES:
- Place the citation number right after the sentence or claim it supports: "...end of sentence[1]."
- If a claim draws from multiple sources, cite them all: "...end of sentence[1][3]."
- Do NOT add citations made-up or not matching the provided sources.
- If the context doesn't address the question but you know the answer, answer using your own knowledge (no citations needed).
- If the user explicitly says they want an answer from the documents only, restrict your answer to the context.
- Be concise, accurate, and helpful.
- If you truly don't know something, say so honestly.
"""


def build_user_prompt(question: str, sources: list[SourceDoc]) -> str:
    """Build the prompt with retrieved context and citation instructions."""
    if not sources:
        return question

    context_blocks = []
    for i, src in enumerate(sources, 1):
        context_blocks.append(f"[{i}] (from: {src.source})\n{src.content}")

    return (
        f"Here is some context from the user's documents:\n{'-' * 60}\n"
        + "\n\n".join(context_blocks)
        + f"\n{'-' * 60}\n\n"
        + f"Question: {question}\n\n"
        + "Answer the question using the context above when relevant. "
        + "Cite your sources inline using [1], [2], etc. "
        + "If no context is relevant, answer from your own knowledge without citations."
    )


class LLMService:
    def __init__(self) -> None:
        settings = get_settings()
        self.client = AsyncOpenAI(
            api_key=settings.OPENROUTER_API_KEY,
            base_url=settings.OPENROUTER_BASE_URL,
            timeout=settings.OPENROUTER_TIMEOUT,
        )
        self.model = settings.OPENROUTER_MODEL
        self.temperature = settings.OPENROUTER_TEMPERATURE
        self.max_tokens = settings.OPENROUTER_MAX_TOKENS
        logger.info("LLM service initialized — model: %s", self.model)

    async def generate(
        self,
        question: str,
        sources: list[SourceDoc],
        chat_history: list[ChatMessage] | None = None,
    ) -> str:
        """Generate a complete (non-streaming) answer."""
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]

        # Add chat history if provided
        if chat_history:
            for msg in chat_history:
                messages.append({"role": msg.role, "content": msg.content})

        messages.append({
            "role": "user",
            "content": build_user_prompt(question, sources),
        })

        resp = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=self.temperature,
            max_tokens=self.max_tokens,
        )

        answer = resp.choices[0].message.content or ""
        logger.info("LLM generated answer (%d chars)", len(answer))
        return answer

    async def generate_stream(
        self,
        question: str,
        sources: list[SourceDoc],
        chat_history: list[ChatMessage] | None = None,
    ) -> AsyncGenerator[str, None]:
        """Stream the answer token by token."""
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]

        if chat_history:
            for msg in chat_history:
                messages.append({"role": msg.role, "content": msg.content})

        messages.append({
            "role": "user",
            "content": build_user_prompt(question, sources),
        })

        stream = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=self.temperature,
            max_tokens=self.max_tokens,
            stream=True,
        )

        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    # ── Direct chat (no RAG context) ─────────────────────────────

    CHAT_SYSTEM_PROMPT = "You are a helpful, friendly assistant that answers questions conversationally."

    async def generate_chat(
        self,
        message: str,
        chat_history: list[ChatMessage] | None = None,
    ) -> str:
        """Generate a complete (non-streaming) answer without RAG context."""
        messages = [{"role": "system", "content": self.CHAT_SYSTEM_PROMPT}]

        if chat_history:
            for msg in chat_history:
                messages.append({"role": msg.role, "content": msg.content})

        messages.append({"role": "user", "content": message})

        resp = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=self.temperature,
            max_tokens=self.max_tokens,
        )

        answer = resp.choices[0].message.content or ""
        return answer

    async def generate_chat_stream(
        self,
        message: str,
        chat_history: list[ChatMessage] | None = None,
    ) -> AsyncGenerator[str, None]:
        """Stream a direct chat answer token by token."""
        messages = [{"role": "system", "content": self.CHAT_SYSTEM_PROMPT}]

        if chat_history:
            for msg in chat_history:
                messages.append({"role": msg.role, "content": msg.content})

        messages.append({"role": "user", "content": message})

        stream = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=self.temperature,
            max_tokens=self.max_tokens,
            stream=True,
        )

        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content


def get_llm_service() -> LLMService:
    if not hasattr(get_llm_service, "_instance"):
        get_llm_service._instance = LLMService()
    return get_llm_service._instance
