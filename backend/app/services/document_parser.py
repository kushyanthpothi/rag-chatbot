"""Parser implementations for supported document types."""
from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path

import httpx
from langchain_core.documents import Document
from markitdown import MarkItDown


# ── Base ────────────────────────────────────────────────────────────

class BaseDocumentParser(ABC):
    @abstractmethod
    def parse(self, file_path: Optional[Path] = None, url: Optional[str] = None) -> list[Document]:
        ...


# ── PDF Parser ──────────────────────────────────────────────────────

class PDFParser(BaseDocumentParser):
    def parse(self, file_path: Optional[Path] = None, url: Optional[str] = None) -> list[Document]:
        if not file_path:
            raise ValueError("file_path required for PDF parsing")
        # Use markitdown for unified parsing
        md = MarkItDown()
        result = md.convert(str(file_path))
        return [
            Document(
                page_content=result.text_content,
                metadata={"source": file_path.name, "file_type": "pdf", "page_number": 0},
            )
        ]


# ── Text / Markdown Parser ─────────────────────────────────────────

class TextParser(BaseDocumentParser):
    """Handles .txt and .md files."""

    def parse(self, file_path: Optional[Path] = None, url: Optional[str] = None) -> list[Document]:
        if not file_path:
            raise ValueError("file_path required for text parsing")
        content = file_path.read_text(encoding="utf-8", errors="replace")
        ext = file_path.suffix.lower()
        return [
            Document(
                page_content=content,
                metadata={"source": file_path.name, "file_type": ext.lstrip("."), "page_number": 0},
            )
        ]


# ── URL Scraper ─────────────────────────────────────────────────────

class URLParser(BaseDocumentParser):
    """Fetches a URL and extracts clean text content."""

    def parse(self, file_path: Optional[Path] = None, url: Optional[str] = None) -> list[Document]:
        if not url:
            raise ValueError("url required for URL parsing")
        # Download to tempfile approach — just fetch and parse directly
        content = self._fetch(url)
        md = MarkItDown()
        try:
            result = md.convert(url)
            return [
                Document(
                    page_content=result.text_content,
                    metadata={"source": url, "file_type": "url", "page_number": 0},
                )
            ]
        except Exception:
            # Fallback to raw text
            return [
                Document(
                    page_content=content,
                    metadata={"source": url, "file_type": "url", "page_number": 0},
                )
            ]

    @staticmethod
    def _fetch(url: str) -> str:
        with httpx.Client(timeout=30.0, follow_redirects=True) as client:
            resp = client.get(url)
            resp.raise_for_status()
            return resp.text


# ── Registry ────────────────────────────────────────────────────────

def get_parser(file_path: str) -> BaseDocumentParser:
    """Return appropriate parser based on file extension or URL."""
    if file_path.startswith(("http://", "https://")):
        return URLParser()

    ext = Path(file_path).suffix.lower()
    parser_map: dict[str, type[BaseDocumentParser]] = {
        ".pdf": PDFParser,
        ".txt": TextParser,
        ".md": TextParser,
        ".markdown": TextParser,
        ".rst": TextParser,
        ".csv": TextParser,
    }
    parser_cls = parser_map.get(ext, TextParser)
    return parser_cls()
