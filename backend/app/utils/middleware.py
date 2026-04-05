import time
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.utils.logger import setup_logger

logger = setup_logger(__name__)


class RequestTimingMiddleware(BaseHTTPMiddleware):
    """Middleware that logs request latency."""

    async def dispatch(self, request: Request, call_next) -> Response:  # type: ignore[override]
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception as exc:
            elapsed = (time.perf_counter() - start) * 1000
            logger.error("%s %s error=%s latency_ms=%.1f",
                         request.method, request.url.path, str(exc), elapsed)
            raise
        else:
            elapsed = (time.perf_counter() - start) * 1000
            if request.url.path not in ("/health", "/docs", "/openapi.json"):
                logger.info("%s %s status=%d latency_ms=%.1f",
                            request.method, request.url.path, response.status_code, elapsed)
            return response