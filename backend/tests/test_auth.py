"""Auth guards and /api/me, using a locally generated signing key (no network, no database)."""

import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient

from app import deps
from app.db import get_db
from app.errors import ApiError
from app.main import create_app
from tests.helpers import ISSUER, FakeSession, client_with, make_profile, token_for, use_local_jwks


@pytest.fixture(autouse=True)
def local_jwks(monkeypatch):
    use_local_jwks(monkeypatch)


def test_me_requires_a_token() -> None:
    response = client_with(FakeSession()).get("/api/me")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_me_rejects_bad_tokens() -> None:
    user = make_profile()
    other_key = ec.generate_private_key(ec.SECP256R1())
    forged = jwt.encode({"sub": str(user.id), "aud": "authenticated", "iss": ISSUER}, other_key, algorithm="ES256")
    expired = token_for(user.id, exp=datetime.now(UTC) - timedelta(minutes=1))
    for token in (forged, expired, "not-a-jwt"):
        response = client_with(FakeSession(user)).get("/api/me", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 401, token
        assert response.json()["error"]["code"] == "INVALID_TOKEN"


def test_me_returns_camel_case_profile_and_marks_invite_accepted() -> None:
    user = make_profile(full_name="Ayla Noor Khan")
    session = FakeSession(user)
    response = client_with(session).get("/api/me", headers={"Authorization": f"Bearer {token_for(user.id)}"})
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Ayla Noor Khan"
    assert body["avatarInitials"] == "AN"
    assert body["role"] == "client"
    assert "accessExpiresAt" in body and "access_expires_at" not in body
    assert user.invitation_status == "accepted" and session.commits == 1


def test_tokens_issued_slightly_in_the_future_are_accepted() -> None:
    # Supabase's clock may run a few seconds ahead of this machine.
    user = make_profile()
    token = token_for(user.id, iat=datetime.now(UTC) + timedelta(seconds=20))
    response = client_with(FakeSession(user)).get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200


def test_users_without_profile_are_rejected() -> None:
    response = client_with(FakeSession()).get("/api/me", headers={"Authorization": f"Bearer {token_for(uuid.uuid4())}"})
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "NO_PROFILE"


@pytest.mark.parametrize(
    ("overrides", "code"),
    [
        ({"access_expires_at": datetime.now(UTC) - timedelta(seconds=1)}, "ACCESS_EXPIRED"),
        ({"access_status": "revoked"}, "ACCESS_REVOKED"),
        ({"role": "admin", "access_status": "revoked", "access_expires_at": None}, "ACCESS_REVOKED"),
    ],
)
def test_blocked_users_get_403(overrides, code) -> None:
    user = make_profile(**overrides)
    response = client_with(FakeSession(user)).get("/api/me", headers={"Authorization": f"Bearer {token_for(user.id)}"})
    assert response.status_code == 403
    assert response.json()["error"]["code"] == code


def test_admins_never_expire() -> None:
    admin = make_profile(role="admin", access_expires_at=None)
    deps.ensure_active_access(admin)  # no exception


def test_require_admin() -> None:
    assert deps.require_admin(make_profile(role="admin", access_expires_at=None)).role == "admin"
    with pytest.raises(ApiError) as exc:
        deps.require_admin(make_profile(role="client"))
    assert exc.value.code == "FORBIDDEN"


def test_update_me_trims_and_blanks_to_null() -> None:
    user = make_profile()
    response = client_with(FakeSession(user)).patch(
        "/api/me",
        headers={"Authorization": f"Bearer {token_for(user.id)}"},
        json={"name": "  New Name ", "city": "   ", "clientRole": "Bride"},
    )
    assert response.status_code == 200
    assert user.full_name == "New Name" and user.city is None and user.client_role == "Bride"


def test_forgot_password_never_reveals_unknown_emails(monkeypatch) -> None:
    session = SimpleNamespace(scalar=lambda _q: None)
    app = create_app()
    app.dependency_overrides[get_db] = lambda: session
    response = TestClient(app).post("/api/auth/forgot-password", json={"email": "nobody@example.com"})
    assert response.status_code == 202
