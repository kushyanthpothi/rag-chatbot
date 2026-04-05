"""Chat memory with per-session isolation and per-tenant storage."""
from __future__ import annotations

import json
import uuid
from pathlib import Path

from app.config import get_settings
from app.models.schemas import ChatMessage
from app.utils.logger import setup_logger

logger = setup_logger(__name__)


class MemoryService:
    """File-based chat memory with per-tenant, per-session isolation."""

    def __init__(self) -> None:
        settings = get_settings()
        self.memory_dir = Path(settings.MEMORY_DIR)
        self.memory_dir.mkdir(parents=True, exist_ok=True)
        self.max_messages = settings.MEMORY_K

    def _path(self, tenant_id: str) -> Path:
        return self.memory_dir / f"{tenant_id}_sessions.json"

    def _load_sessions(self, tenant_id: str) -> dict[str, list[dict]]:
        """Load all sessions for a tenant. Returns {session_id: [messages]}."""
        p = self._path(tenant_id)
        if not p.exists():
            return {}
        try:
            return json.loads(p.read_text())
        except (json.JSONDecodeError, ValueError):
            return {}

    def _save_sessions(self, tenant_id: str, sessions: dict[str, list[dict]]) -> None:
        p = self._path(tenant_id)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(sessions, indent=2))

    def list_sessions(self, tenant_id: str) -> list[dict]:
        """Return list of session summaries: {session_id, user_first_msg, total_messages}."""
        sessions = self._load_sessions(tenant_id)
        result = []
        for sid, msgs in sessions.items():
            user_msgs = [m for m in msgs if m.get("role") == "user"]
            result.append({
                "session_id": sid,
                "preview": user_msgs[0].get("content", "")[:120] if user_msgs else "Empty session",
                "total_messages": len(msgs),
            })
        # Newest first
        return list(reversed(result))

    def get_session(self, tenant_id: str, session_id: str) -> list[ChatMessage]:
        """Get messages for a specific session."""
        sessions = self._load_sessions(tenant_id)
        msgs = sessions.get(session_id, [])
        return [ChatMessage(**m) for m in msgs]

    def create_session(self, tenant_id: str) -> str:
        """Create a new empty session and return its ID."""
        sessions = self._load_sessions(tenant_id)
        sid = str(uuid.uuid4())
        sessions[sid] = []
        self._save_sessions(tenant_id, sessions)
        logger.info("Created session %s for tenant: %s", sid, tenant_id)
        return sid

    def add_message(self, tenant_id: str, session_id: str, message: ChatMessage | dict) -> None:
        """Append a message to a session, trimming to max_messages."""
        sessions = self._load_sessions(tenant_id)
        if session_id not in sessions:
            sessions[session_id] = []
        if isinstance(message, dict):
            msg = ChatMessage(**message)
        else:
            msg = message
        sessions[session_id].append(msg.model_dump())
        # Keep only last N messages per session
        if len(sessions[session_id]) > self.max_messages:
            sessions[session_id] = sessions[session_id][-self.max_messages:]
        self._save_sessions(tenant_id, sessions)

    def delete_session(self, tenant_id: str, session_id: str) -> bool:
        """Delete a specific session."""
        sessions = self._load_sessions(tenant_id)
        if session_id in sessions:
            del sessions[session_id]
            self._save_sessions(tenant_id, sessions)
            logger.info("Deleted session %s for tenant: %s", session_id, tenant_id)
            return True
        return False

    def clear_all(self, tenant_id: str) -> int:
        """Clear all sessions for a tenant. Returns count of deleted sessions."""
        p = self._path(tenant_id)
        if p.exists():
            sessions = self._load_sessions(tenant_id)
            count = len(sessions)
            p.unlink()
            logger.info("Cleared %d sessions for tenant: %s", count, tenant_id)
            return count
        return 0


def get_memory_service() -> MemoryService:
    if not hasattr(get_memory_service, "_instance"):
        get_memory_service._instance = MemoryService()
    return get_memory_service._instance
