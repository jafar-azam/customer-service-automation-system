"""Tests for the ML service skeleton: configuration and authentication."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Settings, get_settings
from app.main import app

TOKEN = "t" * 32


@pytest.fixture(autouse=True)
def _settings(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Point every test at a known configuration, and clear the cache after."""
    monkeypatch.setenv("ML_SERVICE_TOKEN", TOKEN)
    monkeypatch.setenv("NODE_ENV", "test")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


class TestConfiguration:
    def test_reads_the_environment(self) -> None:
        settings = get_settings()
        assert settings.service_token == TOKEN
        assert settings.environment == "test"
        assert settings.port == 8000

    def test_refuses_a_missing_token(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("ML_SERVICE_TOKEN")
        get_settings.cache_clear()
        with pytest.raises(ValidationError):
            Settings()  # type: ignore[call-arg]

    def test_refuses_a_short_token(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("ML_SERVICE_TOKEN", "too-short")
        get_settings.cache_clear()
        with pytest.raises(ValidationError):
            Settings()  # type: ignore[call-arg]

    def test_refuses_an_unknown_environment(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("NODE_ENV", "staging")
        get_settings.cache_clear()
        with pytest.raises(ValidationError):
            Settings()  # type: ignore[call-arg]


class TestHealth:
    def test_is_reachable_without_credentials(self, client: TestClient) -> None:
        """The container runtime calls this, and it has no token."""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


class TestServiceAuthentication:
    def test_accepts_the_service_token(self, client: TestClient) -> None:
        response = client.get("/v1/version", headers={"Authorization": f"Bearer {TOKEN}"})
        assert response.status_code == 200
        body = response.json()
        assert body["name"] == "csas-ml"
        assert body["environment"] == "test"

    def test_rejects_a_missing_header(self, client: TestClient) -> None:
        response = client.get("/v1/version")
        assert response.status_code == 401
        assert response.json()["detail"]["code"] == "unauthorized"

    def test_rejects_the_wrong_token(self, client: TestClient) -> None:
        response = client.get("/v1/version", headers={"Authorization": f"Bearer {'x' * 32}"})
        assert response.status_code == 401

    def test_rejects_a_token_that_is_a_prefix_of_the_real_one(self, client: TestClient) -> None:
        response = client.get("/v1/version", headers={"Authorization": f"Bearer {TOKEN[:-1]}"})
        assert response.status_code == 401

    @pytest.mark.parametrize(
        "header",
        [
            TOKEN,  # no scheme
            f"Basic {TOKEN}",  # wrong scheme
            "Bearer",  # no value
            "Bearer ",  # empty value
        ],
    )
    def test_rejects_malformed_authorization_headers(self, client: TestClient, header: str) -> None:
        response = client.get("/v1/version", headers={"Authorization": header})
        assert response.status_code == 401

    def test_accepts_a_lowercase_scheme(self, client: TestClient) -> None:
        """RFC 9110 makes the auth scheme case-insensitive."""
        response = client.get("/v1/version", headers={"Authorization": f"bearer {TOKEN}"})
        assert response.status_code == 200

    def test_does_not_echo_the_expected_token(self, client: TestClient) -> None:
        response = client.get("/v1/version", headers={"Authorization": "Bearer wrong"})
        assert TOKEN not in response.text
