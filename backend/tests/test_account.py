"""Consent, notification preferences, reply emails and data export (no database, no network)."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.dialects import postgresql

from app.constants import CONSENT_VERSION
from app.models import Message
from app.services import account, email, messaging
from tests.helpers import FakeSession, auth_header, client_with, make_admin, make_profile, use_local_jwks

CONSENT = {"version": CONSENT_VERSION, "terms": True, "dataUse": True, "studioShare": True, "marketing": True}


@pytest.fixture(autouse=True)
def local_jwks(monkeypatch):
    use_local_jwks(monkeypatch)


def accepted_client(**overrides):
    return make_profile(invitation_status="accepted", **overrides)


# ---------- consent ----------


def test_consent_is_saved_on_the_profile_and_returned_by_me() -> None:
    client = accepted_client()
    response = client_with(FakeSession(client)).put("/api/me/consent", headers=auth_header(client), json=CONSENT)
    assert response.status_code == 200
    body = response.json()
    assert body["consent"]["version"] == CONSENT_VERSION and body["consent"]["marketing"] is True
    assert client.consent["data_use"] is True and client.consent["accepted_at"]
    assert body["notifications"] == {"consultantMessages": True, "marketing": True}  # opt-in carried over


def test_consent_needs_every_required_agreement_and_the_current_version() -> None:
    client = accepted_client()
    api = client_with(FakeSession(client))
    missing = api.put("/api/me/consent", headers=auth_header(client), json={**CONSENT, "studioShare": False})
    assert missing.status_code == 400
    outdated = api.put("/api/me/consent", headers=auth_header(client), json={**CONSENT, "version": CONSENT_VERSION + 1})
    assert outdated.status_code == 409 and outdated.json()["error"]["code"] == "CONSENT_OUTDATED"
    assert client.consent is None


def test_me_without_consent_returns_null_and_default_notifications() -> None:
    client = accepted_client()
    body = client_with(FakeSession(client)).get("/api/me", headers=auth_header(client)).json()
    assert body["consent"] is None
    assert body["notifications"] == {"consultantMessages": True, "marketing": False}


def test_admins_cannot_use_client_account_endpoints() -> None:
    admin = make_admin()
    api = client_with(FakeSession(admin))
    assert api.put("/api/me/consent", headers=auth_header(admin), json=CONSENT).status_code == 403
    assert api.patch("/api/me/notifications", headers=auth_header(admin), json={"marketing": True}).status_code == 403
    assert api.get("/api/me/export", headers=auth_header(admin)).status_code == 403


# ---------- notification preferences ----------


def test_notification_patch_changes_only_sent_fields_and_syncs_marketing_consent() -> None:
    client = accepted_client(consent={"version": 1, "accepted_at": "2026-10-16T10:00:00+00:00", "marketing": False},
                             notification_prefs={"consultant_messages": True, "marketing": False, "weekly_digest": True})
    response = client_with(FakeSession(client)).patch(
        "/api/me/notifications", headers=auth_header(client), json={"marketing": True}
    )
    assert response.status_code == 200
    assert response.json()["notifications"] == {"consultantMessages": True, "marketing": True}
    assert client.notification_prefs == {"consultant_messages": True, "marketing": True}  # unsupported keys dropped
    assert client.consent["marketing"] is True


# ---------- consultant reply emails ----------


class ScalarDb:
    def __init__(self, value):
        self.value = value

    def scalar(self, _query):
        return self.value


def reply_at(client, when: datetime) -> Message:
    return Message(id=uuid.uuid4(), client_id=client.id, sender_role="admin", body="hi", created_at=when)


def test_reply_emails_are_debounced_and_respect_the_preference() -> None:
    now = datetime.now(UTC)
    client = make_profile()
    message = reply_at(client, now)
    assert messaging.should_email_reply(ScalarDb(None), client, message)  # first reply
    assert messaging.should_email_reply(ScalarDb(now - timedelta(minutes=30)), client, message)
    assert not messaging.should_email_reply(ScalarDb(now - timedelta(minutes=2)), client, message)  # burst
    client.notification_prefs = {"consultant_messages": False}
    assert not messaging.should_email_reply(ScalarDb(None), client, message)


def test_admin_reply_sends_the_email_in_the_background(monkeypatch) -> None:
    admin, client = make_admin(), accepted_client(email="ayla@example.com")
    admin.full_name = "Sana Consultant"
    sent = []
    monkeypatch.setattr(messaging, "send", lambda _db, _cid, sender, body: reply_at(client, datetime.now(UTC)))
    monkeypatch.setattr(messaging, "should_email_reply", lambda *_: True)
    monkeypatch.setattr(email, "send_email", lambda to, subject, html: sent.append((to, subject, html)))
    response = client_with(FakeSession(admin, client)).post(
        f"/api/admin/clients/{client.id}/messages", headers=auth_header(admin), json={"body": "Private detail"}
    )
    assert response.status_code == 201
    assert len(sent) == 1 and sent[0][0] == "ayla@example.com"
    assert "Sana Consultant" in sent[0][2] and "Private detail" not in sent[0][2]  # message text never emailed


def test_failed_reply_email_never_fails_the_reply(monkeypatch) -> None:
    def boom(*_):
        raise email.EmailSendFailed("down")

    monkeypatch.setattr(email, "send_email", boom)
    messaging.email_reply_notice("a@example.com", "Ayla", "Sana")  # no exception


# ---------- data export ----------


class CapturingDb(FakeSession):
    """Records every export query; returns no rows."""

    def __init__(self, *profiles):
        super().__init__(*profiles)
        self.statements = []

    def scalars(self, statement):
        self.statements.append(statement)
        return []

    def execute(self, statement):
        self.statements.append(statement)
        return type("Rows", (), {"all": lambda _self: []})()


def test_every_export_query_is_limited_to_the_signed_in_client() -> None:
    client = accepted_client()
    db = CapturingDb(client)
    data = account.export_data(db, client)
    assert data["events"] == [] and data["messages"] == [] and data["profile"]["email"] == client.email
    assert len(db.statements) == 7  # events, questionnaires, moodboards, board items, budget, quotes, messages
    for statement in db.statements:
        sql = str(statement.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))
        assert "client_id" in sql and str(client.id) in sql, sql


def test_export_endpoint_downloads_json() -> None:
    client = accepted_client()
    response = client_with(CapturingDb(client)).get("/api/me/export", headers=auth_header(client))
    assert response.status_code == 200
    assert response.headers["content-disposition"].startswith("attachment;")
    assert set(response.json()) == {"exportedAt", "profile", "events", "messages"}
