from collections.abc import Iterator

import pytest
from fastapi import APIRouter
from fastapi.testclient import TestClient

from app.config import Settings
from app.db import check_database
from app.errors import ApiError
from app.main import create_app
from app.schemas.base import CamelModel


def _client(database_ok: bool) -> TestClient:
    app = create_app()
    app.dependency_overrides[check_database] = lambda: database_ok
    return TestClient(app)


def test_health_ok_when_database_reachable() -> None:
    response = _client(True).get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


def test_health_degraded_when_database_down() -> None:
    response = _client(False).get("/api/health")
    assert response.status_code == 503
    assert response.json() == {"status": "degraded", "database": "unavailable"}


def test_unknown_route_uses_error_shape() -> None:
    response = _client(True).get("/api/does-not-exist")
    assert response.status_code == 404
    assert response.json() == {"error": {"code": "NOT_FOUND", "message": "Not Found", "details": {}}}


class _Payload(CamelModel):
    guest_count: int


@pytest.fixture
def app_with_test_routes() -> Iterator[TestClient]:
    app = create_app()
    router = APIRouter()

    @router.post("/api/_test/echo", response_model=_Payload)
    def echo(payload: _Payload) -> _Payload:
        return payload

    @router.get("/api/_test/conflict")
    def conflict() -> None:
        raise ApiError(409, "DUPLICATE_SKU", "SKU already exists.", {"sku": "x"})

    app.include_router(router)
    yield TestClient(app)


def test_validation_errors_return_400_with_fields(app_with_test_routes: TestClient) -> None:
    response = app_with_test_routes.post("/api/_test/echo", json={"guestCount": "lots"})
    assert response.status_code == 400
    body = response.json()["error"]
    assert body["code"] == "VALIDATION_FAILED"
    assert body["details"]["fields"][0]["field"] == "guestCount"


def test_payloads_are_camel_case_in_and_out(app_with_test_routes: TestClient) -> None:
    response = app_with_test_routes.post("/api/_test/echo", json={"guestCount": 120})
    assert response.status_code == 200
    assert response.json() == {"guestCount": 120}


def test_api_error_shape(app_with_test_routes: TestClient) -> None:
    response = app_with_test_routes.get("/api/_test/conflict")
    assert response.status_code == 409
    assert response.json() == {
        "error": {"code": "DUPLICATE_SKU", "message": "SKU already exists.", "details": {"sku": "x"}}
    }


def test_cors_allows_only_the_frontend_origin() -> None:
    client = _client(True)
    allowed = client.options(
        "/api/health", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"}
    )
    blocked = client.options(
        "/api/health", headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "GET"}
    )
    assert allowed.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert "access-control-allow-origin" not in blocked.headers


@pytest.mark.parametrize(
    ("given", "expected"),
    [
        ("postgresql://u:p@h:5432/db", "postgresql+psycopg://u:p@h:5432/db"),
        ("postgres://u:p@h:5432/db", "postgresql+psycopg://u:p@h:5432/db"),
        ("postgresql+psycopg://u:p@h:5432/db", "postgresql+psycopg://u:p@h:5432/db"),
    ],
)
def test_database_url_uses_psycopg_driver(given: str, expected: str) -> None:
    settings = Settings(_env_file=None, supabase_url="x", supabase_secret_key="x", database_url=given)
    assert settings.database_url == expected
