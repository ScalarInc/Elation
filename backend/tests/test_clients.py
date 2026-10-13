"""Client management rules. Supabase and Resend are replaced with fakes; no network or database."""

from datetime import UTC, datetime, timedelta

import pytest

from app.errors import ApiError
from app.services import clients, email, supabase_admin
from tests.helpers import FakeSession, auth_header, client_with, make_admin, make_profile, use_local_jwks


@pytest.fixture(autouse=True)
def local_jwks(monkeypatch):
    use_local_jwks(monkeypatch)


@pytest.fixture
def fake_supabase(monkeypatch):
    calls: dict[str, list] = {"links": [], "bans": []}
    new_id = "11111111-1111-1111-1111-111111111111"

    def generate_link(link_type, address, _path):
        calls["links"].append(link_type)
        return supabase_admin.GeneratedLink(user_id=new_id, action_link=f"https://link/{link_type}")

    monkeypatch.setattr(supabase_admin, "generate_link", generate_link)
    monkeypatch.setattr(supabase_admin, "set_banned", lambda uid, banned: calls["bans"].append(banned))
    monkeypatch.setattr(clients, "find_by_email", lambda _db, _address: None)
    return calls


def test_client_status_priority() -> None:
    now = datetime.now(UTC)
    assert clients.client_status(make_profile(), now) == "pending"
    assert clients.client_status(make_profile(invitation_status="accepted"), now) == "active"
    assert clients.client_status(make_profile(access_expires_at=now - timedelta(seconds=1)), now) == "expired"
    assert clients.client_status(make_profile(access_status="revoked", access_expires_at=now - timedelta(days=1)), now) == "revoked"


def test_clients_cannot_use_admin_endpoints() -> None:
    client = make_profile(invitation_status="accepted")
    response = client_with(FakeSession(client)).get("/api/admin/clients", headers=auth_header(client))
    assert response.status_code == 403


def test_create_client_defaults_and_still_returns_link_when_email_fails(fake_supabase, monkeypatch) -> None:
    def failing_send(*_args):
        raise email.EmailSendFailed("Resend returned HTTP 403.")

    monkeypatch.setattr(email, "send_email", failing_send)
    admin = make_admin()
    session = FakeSession(admin)

    response = client_with(session).post(
        "/api/admin/clients", headers=auth_header(admin), json={"name": "  Ayla Khan ", "email": "Ayla@Example.com"}
    )

    assert response.status_code == 201
    body = response.json()
    assert body["emailSent"] is False and body["emailError"] == "Resend returned HTTP 403."
    assert body["inviteLink"] == "https://link/invite"
    created = body["client"]
    assert created["name"] == "Ayla Khan" and created["email"] == "ayla@example.com"
    assert created["status"] == "pending"
    assert created["consultant"]["id"] == str(admin.id)
    expires = datetime.fromisoformat(created["accessExpiresAt"])
    assert timedelta(days=29, hours=23) < expires - datetime.now(UTC) <= timedelta(days=30)


def test_create_client_rejects_existing_email(monkeypatch) -> None:
    monkeypatch.setattr(clients, "find_by_email", lambda _db, _address: make_profile())
    admin = make_admin()
    with pytest.raises(ApiError) as exc:
        clients.create_client(FakeSession(admin), admin, full_name="X Y", address="a@b.co", phone=None, city=None, access_days=None)
    assert exc.value.code == "EMAIL_IN_USE"


def test_resend_falls_back_to_set_password_link_for_existing_users(monkeypatch) -> None:
    kinds = []

    def generate_link(link_type, _address, _path):
        kinds.append(link_type)
        if link_type == "invite":
            raise supabase_admin.SupabaseAdminError(422, "email_exists", "exists")
        return supabase_admin.GeneratedLink(user_id="x", action_link="https://link/recovery")

    monkeypatch.setattr(supabase_admin, "generate_link", generate_link)
    monkeypatch.setattr(email, "send_email", lambda *_a: None)
    result = clients.resend_invitation(FakeSession(), make_profile())
    assert kinds == ["invite", "recovery"]
    assert result.email_sent and result.invite_link == "https://link/recovery"


def test_revoke_and_reactivate_ban_in_supabase(fake_supabase) -> None:
    admin, client = make_admin(), make_profile(invitation_status="accepted")
    api = client_with(FakeSession(admin, client))

    revoked = api.patch(f"/api/admin/clients/{client.id}", headers=auth_header(admin), json={"accessStatus": "revoked"})
    assert revoked.json()["status"] == "revoked"
    reactivated = api.patch(f"/api/admin/clients/{client.id}", headers=auth_header(admin), json={"accessStatus": "active"})
    assert reactivated.json()["status"] == "active"
    assert fake_supabase["bans"] == [True, False]


def test_extend_access(fake_supabase) -> None:
    admin = make_admin()
    client = make_profile(access_expires_at=datetime.now(UTC) - timedelta(days=1))
    new_expiry = (datetime.now(UTC) + timedelta(days=60)).isoformat()
    response = client_with(FakeSession(admin, client)).patch(
        f"/api/admin/clients/{client.id}", headers=auth_header(admin), json={"accessExpiresAt": new_expiry}
    )
    assert response.status_code == 200 and response.json()["status"] == "pending"


def test_consultant_must_be_an_admin(fake_supabase) -> None:
    admin, client, other_client = make_admin(), make_profile(), make_profile()
    response = client_with(FakeSession(admin, client, other_client)).patch(
        f"/api/admin/clients/{client.id}", headers=auth_header(admin), json={"consultantId": str(other_client.id)}
    )
    assert response.status_code == 400
