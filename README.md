# <img src="final.svg" width="25" height="25" style="vertical-align: middle; margin-right: 6px;"> RAG Chatbot

Production-ready Retrieval-Augmented Generation chatbot built with FastAPI, React, ChromaDB, and OpenRouter.

## Overview

RAG Chatbot is a full-stack application that enables natural-language question answering over uploaded documents. Documents are parsed, chunked, embedded, and stored in a vector database. At query time, relevant passages are retrieved and used as context for an LLM response.

## Architecture

```
+-------------+     +--------------+     +---------------+
|  Frontend   |---->|   FastAPI    |---->|  OpenRouter   |
| React + TS  |<----|  Backend     |<----|  (Free LLM)   |
+-------------+     |              |     +---------------+
                    |  +---------+ |
                    |  |ChromaDB | |  +----------------+
                    |  |Vectors  |<--| sentence-      |
                    |  +---------+ |  | transformers   |
                    |  +---------+ |  +----------------+
                    |  | Memory  | |
                    |  +---------+ |
                    +--------------+
```

## Technology Stack

| Component | Technology |
|-----------|------------|
| Backend | FastAPI, Pydantic, Uvicorn |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Embeddings | sentence-transformers (all-MiniLM-L6-v2) |
| Vector Store | ChromaDB |
| LLM | OpenRouter (free-tier models) |
| Document Parsing | markitdown, langchain-text-splitters |
| Deployment | Docker Compose |
| Observability | Structured JSON logging, request timing middleware |

## Features

- Document ingestion from PDF, TXT, Markdown, and URL sources
- Recursive character chunking with configurable size and overlap
- Persistent vector storage with ChromaDB
- Multi-tenant support via isolated collections
- Short-term conversational memory with configurable message history
- Streaming responses via Server-Sent Events (SSE)
- Source attribution with similarity scores for every response
- CORS configured for frontend proxy
- Health check endpoint with document count
- Docker Compose deployment with volume persistence
- Retrieval evaluation script for precision/recall testing

## Project Structure

```
.
├── backend/
│   ├── app/
│   │   ├── api/            # FastAPI route handlers
│   │   │   ├── chat.py         # Streaming chat completions
│   │   │   ├── documents.py    # Document upload, URL ingestion, deletion
│   │   │   └── health.py       # Health check
│   │   ├── services/       # Core business logic
│   │   │   ├── embedding_service.py   # sentence-transformers wrapper
│   │   │   ├── vector_store.py        # ChromaDB operations
│   │   │   ├── document_parser.py     # PDF/TXT/MD/URL parsers
│   │   │   ├── ingestion_service.py   # Ingestion pipeline
│   │   │   ├── retrieval_service.py   # Query to relevant chunks
│   │   │   ├── llm_service.py         # OpenRouter streaming client
│   │   │   └── memory_service.py      # Chat session history
│   │   ├── models/         # Pydantic request/response schemas
│   │   └── utils/          # Structured logging, timing middleware
│   ├── data/               # Persistent storage (gitignored)
│   │   ├── chroma/         # Vector database files
│   │   ├── uploads/        # Temporary upload directory
│   │   └── memory/         # Chat history JSON files
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/               # React + TypeScript + Vite + Tailwind
├── deploy/
│   └── docker-compose.yml
├── eval/
│   └── evaluate.py         # Retrieval precision/recall evaluation
└── final.svg               # Architecture diagram
```

## Quick Start

### Prerequisites

- Python 3.11 or later
- Node.js 18 or later
- OpenRouter API key (free tier available at https://openrouter.ai)

### Backend

```bash
cd backend
cp .env.example .env
```

Edit `.env` and set `OPENROUTER_API_KEY` with your API key.

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

Open a new terminal:

```bash
cd frontend
npm install
npm run dev
```

| Service | URL |
|---------|-----|
| Backend API | http://localhost:8000 |
| Frontend UI | http://localhost:5173 |
| API Documentation (Swagger) | http://localhost:8000/docs |

## Docker Deployment

```bash
cd deploy
docker compose up --build
```

Volumes persist ChromaDB data, uploaded files, and chat history across restarts.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check with document count |
| `POST` | `/documents/upload` | Upload PDF, TXT, or Markdown files |
| `POST` | `/documents/upload/url` | Ingest content from a URL |
| `DELETE` | `/documents/delete` | Delete documents by ID |
| `POST` | `/query` | Ask a question (complete response) |
| `POST` | `/query/stream` | Ask a question (streaming SSE) |

### Example Requests

```bash
# Health check
curl http://localhost:8000/health

# Upload documents
curl -X POST http://localhost:8000/documents/upload \
  -F "files=@readme.pdf" \
  -F "tenant_id=default"

# Ingest a URL
curl -X POST "http://localhost:8000/documents/upload/url?url=https://example.com/article" \
  -F "tenant_id=default"

# Delete documents
curl -X DELETE http://localhost:8000/documents/delete \
  -H "Content-Type: application/json" \
  -d '{"document_ids": ["doc_123", "doc_456"]}'

# Ask a question
curl -X POST http://localhost:8000/query \
  -H "Content-Type: application/json" \
  -d '{"question": "What does this document say about AI?", "tenant_id": "default"}'

# Stream a question
curl -X POST http://localhost:8000/query/stream \
  -H "Content-Type: application/json" \
  -d '{"question": "What does this document say about AI?"}'
```

## Configuration

All settings are managed through `.env`. See `backend/.env.example` for defaults.

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENROUTER_API_KEY` | (required) | OpenRouter API key |
| `OPENROUTER_MODEL` | `google/gemma-7b-it:free` | LLM model identifier |
| `EMBEDDING_MODEL` | `all-MiniLM-L6-v2` | Sentence transformer model |
| `CHUNK_SIZE` | `750` | Text chunk size in characters |
| `CHUNK_OVERLAP` | `150` | Overlap between adjacent chunks |
| `TOP_K` | `5` | Number of chunks retrieved per query |
| `SIMILARITY_THRESHOLD` | `0.2` | Minimum similarity score (0 to 1) |

## Document Flow

1. **Ingest** -- Upload a PDF, TXT, Markdown, or URL. The file is parsed into text, split into overlapping chunks, and embedded using a local sentence transformer.
2. **Store** -- Embeddings and metadata are persisted in ChromaDB, organized by tenant ID for multi-tenant isolation.
3. **Query** -- A user question is embedded and used to retrieve the top-K most similar chunks from the vector store.
4. **Generate** -- Retrieved chunks are assembled into a context prompt and sent to the LLM via OpenRouter. The response is streamed back to the client via SSE.
5. **Memory** -- Conversation history is stored and injected into subsequent queries within the same session for contextual follow-ups.

## Evaluation

The `eval/evaluate.py` script measures top-K retrieval precision and recall. Provide a dataset of queries with known relevant document IDs to benchmark the embedding and retrieval pipeline.

```bash
cd eval
python evaluate.py --k 5
```
