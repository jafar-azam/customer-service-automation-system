"""Logging, metrics and readiness for the ML service.

The same three ideas as the Node server, so one runbook covers both:

* **JSON on stdout**, with the request id echoed from the caller, so a single
  id follows a request from the browser through the API server into this
  process.
* **Liveness and readiness are different questions.** ``/health`` says the
  process is up; ``/ready`` says it can serve. They are identical today — the
  service loads no models until Phase 7 — and the split exists now so that
  adding a model load in step 23 does not change any caller.
* **Metrics are a Prometheus scrape endpoint**, unauthenticated but reachable
  only on the internal network, exactly as on the server.
"""

from __future__ import annotations

import json
import logging
import sys
import time
from collections.abc import Awaitable, Callable
from contextvars import ContextVar
from typing import Any
from uuid import uuid4

from prometheus_client import CollectorRegistry, Counter, Histogram
from starlette.requests import Request
from starlette.responses import Response

REQUEST_ID_HEADER = "x-request-id"

#: Set per request, read by the log formatter. ``contextvars`` is the asyncio
#: equivalent of the server's AsyncLocalStorage: it survives ``await``.
request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)

#: Matches the server's rule — a caller-supplied id is honoured only if it
#: cannot inject a line into the log.
_SAFE_ID_CHARS = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_")


def resolve_request_id(header: str | None) -> str:
    """Accept a well-formed inbound id, otherwise generate one."""
    if header is not None and 8 <= len(header) <= 64 and set(header) <= _SAFE_ID_CHARS:
        return header
    return str(uuid4())


class JsonLogFormatter(logging.Formatter):
    """Renders a log record as one JSON object, with the request id attached."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "time": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created))
            + f".{int(record.msecs):03d}Z",
            "level": record.levelname.lower(),
            "name": "csas-ml",
            "msg": record.getMessage(),
        }
        request_id = request_id_var.get()
        if request_id is not None:
            payload["requestId"] = request_id
        if record.exc_info:
            # The traceback goes to the log and never to a response body.
            payload["err"] = self.formatException(record.exc_info)
        for key, value in getattr(record, "extra_fields", {}).items():
            payload[key] = value
        return json.dumps(payload, ensure_ascii=False)


def configure_logging(level: str) -> logging.Logger:
    """Replace the default handlers so nothing writes unstructured text."""
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonLogFormatter())

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level.upper())

    # uvicorn installs its own handlers; without this every request is logged
    # twice, once as JSON and once as plain text.
    for name in ("uvicorn", "uvicorn.error"):
        uvicorn_logger = logging.getLogger(name)
        uvicorn_logger.handlers = []
        uvicorn_logger.propagate = True

    # uvicorn's access log is switched off rather than reformatted: the
    # middleware below already logs every request with the request id, the route
    # pattern and the duration, and uvicorn's version has none of those. Left
    # on, it also re-logs the health checks the middleware deliberately keeps
    # quiet, which is how a log becomes unreadable.
    access = logging.getLogger("uvicorn.access")
    access.handlers = []
    access.propagate = False
    access.disabled = True

    return logging.getLogger("csas-ml")


class Metrics:
    """A per-application registry, for the same reason as on the server: a
    module-level singleton makes two tests in one process collide."""

    def __init__(self) -> None:
        self.registry = CollectorRegistry()
        self.request_duration = Histogram(
            "http_request_duration_seconds",
            "Duration of HTTP requests in seconds",
            labelnames=("method", "route", "status"),
            buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5),
            registry=self.registry,
        )
        self.requests_total = Counter(
            "http_requests_total",
            "Total HTTP requests",
            labelnames=("method", "route", "status"),
            registry=self.registry,
        )


def route_label(request: Request) -> str:
    """The matched route pattern, or ``unmatched``.

    Never the raw path: an unauthenticated 404 is attacker-controlled input, and
    one time series per probed URL is how a metrics store is filled up.
    """
    route = request.scope.get("route")
    path = getattr(route, "path", None)
    return path if isinstance(path, str) else "unmatched"


QUIET_PATHS = frozenset({"/health", "/ready", "/metrics"})


def observability_middleware(
    metrics: Metrics, logger: logging.Logger
) -> Callable[[Request, Callable[[Request], Awaitable[Response]]], Awaitable[Response]]:
    """Request id, access log and metrics, in one pass."""

    async def middleware(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        request_id = resolve_request_id(request.headers.get(REQUEST_ID_HEADER))
        request_id_scope = request_id_var.set(request_id)
        started = time.perf_counter()
        try:
            response = await call_next(request)
        finally:
            request_id_var.reset(request_id_scope)

        duration = time.perf_counter() - started
        labels = (request.method, route_label(request), str(response.status_code))
        metrics.request_duration.labels(*labels).observe(duration)
        metrics.requests_total.labels(*labels).inc()
        response.headers[REQUEST_ID_HEADER] = request_id

        if not (request.url.path in QUIET_PATHS and response.status_code < 400):
            logger.info(
                "request completed",
                extra={
                    "extra_fields": {
                        "requestId": request_id,
                        "method": request.method,
                        # The path only: a query string can carry a token.
                        "path": request.url.path,
                        "route": labels[1],
                        "status": response.status_code,
                        "durationMs": round(duration * 1000, 1),
                    }
                },
            )
        return response

    return middleware
