"""Shared test helpers: fake profiles, locally signed tokens and an in-memory session stand-in."""

import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import jwt
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient

from app import deps
from app.db import get_db
from app.main import create_app
from app.models import Profile

ISSUER = "https://test-project.supabase.co/auth/v1"
SIGNING_KEY = ec.generate_private_key(ec.SECP256R1())


class FakeSession:
    """Just enough of a SQLAlchemy session for routes that look profiles up by id."""

    def __init__(self, *profiles: Profile):
        self.rows = {p.id: p for p in profiles}
        self.commits = 0

    def get(self, _model, key):
        return self.rows.get(key)

    def add(self, obj):
        self.rows[obj.id] = obj

    def scalar(self, _query):
        return 0

    def commit(self):
        self.commits += 1


def make_profile(**overrides) -> Profile:
    values = dict(
        id=uuid.uuid4(), role="client", is_superuser=False, full_name="Test Client", email="client@example.com",
        access_status="active", invitation_status="pending", access_expires_at=datetime.now(UTC) + timedelta(days=30),
        notification_prefs={}, assigned_admin_id=None, created_at=datetime.now(UTC),
    )
    values.update(overrides)
    return Profile(**values)


def make_admin(**overrides) -> Profile:
    return make_profile(role="admin", full_name="Test Admin", email="admin@example.com", access_expires_at=None,
                        invitation_status="accepted", **overrides)


def token_for(user_id: uuid.UUID, **claims) -> str:
    payload = {"sub": str(user_id), "aud": "authenticated", "iss": ISSUER, "exp": datetime.now(UTC) + timedelta(hours=1)}
    payload.update(claims)
    return jwt.encode(payload, SIGNING_KEY, algorithm="ES256")


def auth_header(profile: Profile) -> dict[str, str]:
    return {"Authorization": f"Bearer {token_for(profile.id)}"}


def use_local_jwks(monkeypatch) -> None:
    fake_client = SimpleNamespace(get_signing_key_from_jwt=lambda _t: SimpleNamespace(key=SIGNING_KEY.public_key()))
    monkeypatch.setattr(deps, "_jwks_client", lambda: fake_client)


def client_with(session) -> TestClient:
    app = create_app()
    app.dependency_overrides[get_db] = lambda: session
    return TestClient(app)
