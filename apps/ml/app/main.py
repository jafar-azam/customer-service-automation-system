"""C.S.A.S ML service.

Step 02 ships the skeleton: configuration validation, service-to-service
authentication and a liveness endpoint. The models it will serve — topic
classification, embeddings and calibrated escalation scoring — arrive in
Phase 7, and are deliberately absent rather than stubbed, so that nothing here
pretends to be an implementation.
"""

from typing import Annotated

from fastapi import Depends, FastAPI
from pydantic import BaseModel

from app.config import Settings, get_settings
from app.security import require_service_token

VERSION = "0.1.0"

app = FastAPI(
    title="C.S.A.S ML service",
    version=VERSION,
    description="Classification, embeddings and confidence scoring for the C.S.A.S assistant.",
)


class Health(BaseModel):
    status: str


class VersionInfo(BaseModel):
    name: str
    version: str
    environment: str


@app.get("/health", response_model=Health, tags=["operations"])
def health() -> Health:
    """Liveness. Unauthenticated on purpose: the container runtime calls it."""
    return Health(status="ok")


@app.get(
    "/v1/version",
    response_model=VersionInfo,
    tags=["operations"],
    dependencies=[Depends(require_service_token)],
)
def version(settings: Annotated[Settings, Depends(get_settings)]) -> VersionInfo:
    """Authenticated: proves the service token path works end to end."""
    return VersionInfo(name="csas-ml", version=VERSION, environment=settings.environment)
