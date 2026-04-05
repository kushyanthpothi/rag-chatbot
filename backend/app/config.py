from pathlib import Path
from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # General
    APP_NAME: str = "RAG Chatbot"
    DEBUG: bool = False

    # OpenRouter
    OPENROUTER_API_KEY: str
    OPENROUTER_MODEL: str = "qwen/qwen3.6-plus:free"  # free tier model
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    OPENROUTER_TEMPERATURE: float = 0.1
    OPENROUTER_MAX_TOKENS: int = 1024
    OPENROUTER_TIMEOUT: int = 60

    # Embeddings
    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"
    EMBEDDING_BATCH_SIZE: int = 32

    # Vector DB
    CHROMA_PERSIST_DIR: str = str(Path(__file__).parent.parent / "data" / "chroma")

    # Document ingestion
    CHUNK_SIZE: int = 750
    CHUNK_OVERLAP: int = 150

    # Retrieval
    TOP_K: int = 10
    SIMILARITY_THRESHOLD: float = 0.15

    # Storage
    UPLOAD_DIR: str = str(Path(__file__).parent.parent / "data" / "uploads")

    # Chat memory
    MEMORY_K: int = 5  # last N messages
    MEMORY_DIR: str = str(Path(__file__).parent.parent / "data" / "memory")

    # Multi-tenant: basic collection per tenant
    DEFAULT_TENANT: str = "default"

    # CORS
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    return Settings()
