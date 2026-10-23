"""C.S.A.S ML service.

Step 02 shipped the skeleton: configuration validation, service-to-service
authentication and a liveness endpoint. Step 03 adds the observability baseline
— structured logs carrying the caller's request id, readiness separate from
liveness, and a Prometheus scrape endpoint.

The models it will serve — topic classification, embeddings and calibrated
escalation scoring — arrive in Phase 7, and are deliberately absent rather than
stubbed, so that nothing here pretends to be an implementation.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from pydantic import BaseModel

from app.config import Settings, get_settings
from app.observability import Metrics, configure_logging, observability_middleware
from app.security import require_service_token

VERSION = "0.1.0"

# Configured at import rather than only in the lifespan, because uvicorn emits
# its first few lines ("Started server process") while loading this module —
# after that, anything left at the default configuration prints unstructured
# text into an otherwise JSON log. The validated level is applied below, as soon
# as the configuration has been read.
logger = configure_logging("info")
metrics = Metrics()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Startup work.

    The configuration is read here rather than at import time. Reading it at
    import time makes the module unimportable without a full environment, which
    turns every test into an environment-setup exercise — and the fail-fast
    guarantee is unaffected, because uvicorn aborts if this raises.
    """
    settings = get_settings()
    configure_logging(settings.log_level)
    logger.info(
        "csas-ml ready",
        extra={"extra_fields": {"version": VERSION, "environment": settings.environment}},
    )
    yield


app = FastAPI(
    title="C.S.A.S ML service",
    version=VERSION,
    description="Classification, embeddings and confidence scoring for the C.S.A.S assistant.",
    lifespan=lifespan,
)
app.middleware("http")(observability_middleware(metrics, logger))


class Health(BaseModel):
    status: str


class Readiness(BaseModel):
    status: str
    checks: dict[str, str]


class VersionInfo(BaseModel):
    name: str
    version: str
    environment: str


@app.get("/health", response_model=Health, tags=["operations"])
def health() -> Health:
    """Liveness. Unauthenticated on purpose: the container runtime calls it."""
    return Health(status="ok")


@app.get("/ready", response_model=Readiness, tags=["operations"])
def ready() -> Readiness:
    """Readiness: can this process serve a request?

    It reports no checks today because the service holds no models and opens no
    connections. Step 23 adds the loaded-model check here, and callers do not
    have to change when it does — which is the reason the endpoint exists now
    rather than later.
    """
    return Readiness(status="ready", checks={})


@app.get("/metrics", tags=["operations"])
def prometheus_metrics() -> Response:
    """Prometheus scrape endpoint.

    Unauthenticated like the server's, and protected the same way: the service
    is published on 127.0.0.1 only and the reverse proxy does not forward to it.
    """
    return Response(generate_latest(metrics.registry), media_type=CONTENT_TYPE_LATEST)


@app.get(
    "/v1/version",
    response_model=VersionInfo,
    tags=["operations"],
    dependencies=[Depends(require_service_token)],
)
def version(settings: Annotated[Settings, Depends(get_settings)]) -> VersionInfo:
    """Authenticated: proves the service token path works end to end."""
    return VersionInfo(name="csas-ml", version=VERSION, environment=settings.environment)
