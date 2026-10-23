"""Tests for the ML service's observability baseline."""

import json
import logging
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app
from app.observability import (
    JsonLogFormatter,
    configure_logging,
    request_id_var,
    resolve_request_id,
)

TOKEN = "t" * 32


@pytest.fixture(autouse=True)
def _settings(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("ML_SERVICE_TOKEN", TOKEN)
    monkeypatch.setenv("NODE_ENV", "test")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


class TestLiveness:
    def test_health_needs_no_credentials(self, client: TestClient) -> None:
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


class TestReadiness:
    def test_reports_ready(self, client: TestClient) -> None:
        response = client.get("/ready")
        assert response.status_code == 200
        assert response.json()["status"] == "ready"

    def test_is_separate_from_liveness(self, client: TestClient) -> None:
        """Both exist, so step 23 can add a model check without moving anyone."""
        assert client.get("/health").status_code == 200
        assert client.get("/ready").status_code == 200


class TestMetrics:
    def test_serves_prometheus_text(self, client: TestClient) -> None:
        client.get("/health")
        response = client.get("/metrics")
        assert response.status_code == 200
        assert "text/plain" in response.headers["content-type"]
        assert "http_requests_total" in response.text

    def test_labels_with_the_route_pattern(self, client: TestClient) -> None:
        client.get("/health")
        assert 'route="/health"' in client.get("/metrics").text

    def test_collapses_unmatched_paths(self, client: TestClient) -> None:
        """One time series per probed URL is how a metrics store is filled up."""
        client.get("/not-a-route-1")
        client.get("/not-a-route-2")
        text = client.get("/metrics").text
        assert 'route="unmatched"' in text
        assert "not-a-route-1" not in text


class TestRequestId:
    def test_is_returned_on_every_response(self, client: TestClient) -> None:
        response = client.get("/health")
        assert len(response.headers["x-request-id"]) == 36

    def test_echoes_a_safe_caller_supplied_id(self, client: TestClient) -> None:
        response = client.get("/health", headers={"x-request-id": "server-abc-123"})
        assert response.headers["x-request-id"] == "server-abc-123"

    def test_rejects_an_id_that_could_inject_a_log_line(self) -> None:
        forged = 'abcdefgh\n{"level":"info","msg":"nothing to see here"}'
        assert resolve_request_id(forged) != forged

    def test_rejects_an_id_that_is_too_long(self) -> None:
        assert len(resolve_request_id("x" * 65)) == 36

    def test_rejects_an_id_that_is_too_short(self) -> None:
        assert len(resolve_request_id("abc")) == 36


class TestJsonLogFormatter:
    def _record(self, msg: str = "hello") -> logging.LogRecord:
        return logging.LogRecord("csas-ml", logging.INFO, __file__, 1, msg, None, None)

    def test_writes_one_json_object_per_line(self) -> None:
        line = JsonLogFormatter().format(self._record())
        payload = json.loads(line)
        assert payload["msg"] == "hello"
        assert payload["level"] == "info"
        assert payload["name"] == "csas-ml"
        assert "\n" not in line

    def test_attaches_the_request_id_from_context(self) -> None:
        request_id_scope = request_id_var.set("req-42")
        try:
            payload = json.loads(JsonLogFormatter().format(self._record()))
        finally:
            request_id_var.reset(request_id_scope)
        assert payload["requestId"] == "req-42"

    def test_omits_the_request_id_outside_a_request(self) -> None:
        payload = json.loads(JsonLogFormatter().format(self._record()))
        assert "requestId" not in payload

    def test_keeps_arabic_readable_rather_than_escaping_it(self) -> None:
        """A log a reviewer cannot read is a log nobody reads."""
        payload = JsonLogFormatter().format(self._record("الطابعة"))
        assert "الطابعة" in payload


class TestLogConfiguration:
    def test_silences_uvicorns_own_access_log(self) -> None:
        """The middleware logs every request with far more context, and
        uvicorn's version re-logs the health checks we keep quiet."""
        configure_logging("info")
        assert logging.getLogger("uvicorn.access").disabled is True

    def test_routes_uvicorn_errors_through_the_json_handler(self) -> None:
        configure_logging("info")
        assert logging.getLogger("uvicorn.error").propagate is True
