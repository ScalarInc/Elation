"""Messaging rules: role checks and validation (no database)."""

import pytest

from app.errors import ApiError
from app.services import messaging
from tests.helpers import FakeSession, auth_header, client_with, make_admin, make_profile, use_local_jwks


@pytest.fixture(autouse=True)
def local_jwks(monkeypatch):
    use_local_jwks(monkeypatch)


def test_blank_and_oversized_messages_rejected() -> None:
    client = make_profile()
    for body in ("   ", "x" * 4001):
        with pytest.raises(ApiError):
            messaging.send(FakeSession(), client.id, client, body)


def test_api_rejects_empty_body() -> None:
    client = make_profile(invitation_status="accepted")
    response = client_with(FakeSession(client)).post("/api/messages", headers=auth_header(client), json={"body": ""})
    assert response.status_code == 400


def test_clients_cannot_open_the_admin_inbox() -> None:
    client = make_profile(invitation_status="accepted")
    response = client_with(FakeSession(client)).get("/api/admin/conversations", headers=auth_header(client))
    assert response.status_code == 403


def test_admins_cannot_post_into_a_non_client_thread() -> None:
    admin, other_admin = make_admin(), make_admin()
    response = client_with(FakeSession(admin, other_admin)).post(
        f"/api/admin/clients/{other_admin.id}/messages", headers=auth_header(admin), json={"body": "hi"}
    )
    assert response.status_code == 404
