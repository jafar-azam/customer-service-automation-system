"""Configuration for the ML service, validated at import time.

Mirrors the server's approach: refuse to start on a bad configuration rather
than fail later on the first request, and never echo a value in an error.
"""

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

TOKEN_MIN_LENGTH = 32


class Settings(BaseSettings):
    """Environment-derived settings.

    The service-to-service token is required and has no default: a default
    would mean a deployment that forgot to set it still answers requests.
    """

    model_config = SettingsConfigDict(env_prefix="", extra="ignore")

    environment: Literal["development", "test", "production"] = Field(
        default="development", alias="NODE_ENV"
    )
    log_level: Literal["critical", "error", "warning", "info", "debug"] = Field(
        default="info", alias="ML_LOG_LEVEL"
    )
    service_token: str = Field(alias="ML_SERVICE_TOKEN", min_length=TOKEN_MIN_LENGTH)
    port: int = Field(default=8000, alias="ML_PORT", ge=1, le=65535)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Settings, read once per process."""
    return Settings()  # type: ignore[call-arg]  # values come from the environment
