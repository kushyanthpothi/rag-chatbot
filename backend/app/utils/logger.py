import logging
import sys
from datetime import datetime, timezone

from app.config import get_settings


class LogFormatter(logging.Formatter):
    """Structured JSON log formatter for observability."""

    def format(self, record: logging.LogRecord) -> str:
        log_data: dict = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }
        if record.exc_info and record.exc_info[0]:
            log_data["exception"] = self.formatException(record.exc_info)
        if hasattr(record, "latency_ms"):
            log_data["latency_ms"] = getattr(record, "latency_ms")
        if hasattr(record, "context"):
            log_data["context"] = getattr(record, "context")
        return str(log_data)


def setup_logger(name: str) -> logging.Logger:
    """Set up a structured logger."""
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(LogFormatter())
    logger.addHandler(handler)
    settings = get_settings()
    logger.setLevel(logging.DEBUG if settings.DEBUG else logging.INFO)
    return logger
