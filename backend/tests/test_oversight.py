"""Oversight numbers and admin-only access (no database)."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.models import Event, Moodboard, QuoteRequest
from app.services import oversight
from tests.helpers import FakeSession, auth_header, client_with, make_profile, use_local_jwks

NOW = datetime(2026, 10, 16, 12, tzinfo=UTC)


@pytest.fixture(autouse=True)
def local_jwks(monkeypatch):
    use_local_jwks(monkeypatch)


class Rows:
    """Answers `scalars(select(Model))` from in-memory lists, keyed by model."""

    def __init__(self, **by_model):
        self.by_model = by_model

    def scalars(self, query):
        model = query.column_descriptions[0]["entity"]
        return list(self.by_model.get(model.__name__, []))


def test_analytics_buckets_and_weeks() -> None:
    events = [Event(type="Mehndi", target_budget_pkr=750_000), Event(type="Mehndi", target_budget_pkr=3_000_000),
              Event(type="Walima", target_budget_pkr=None)]
    boards = [Moodboard(style="Garden", mood="Romantic", created_at=NOW - timedelta(days=1)),
              Moodboard(style="Regal · Modern Luxury", mood="Romantic", created_at=NOW - timedelta(weeks=20))]
    quotes = [QuoteRequest(status="new", created_at=NOW)]
    data = oversight.analytics(Rows(Event=events, Moodboard=boards, QuoteRequest=quotes), now=NOW)

    assert data["events_by_type"][0] == {"label": "Mehndi", "value": 2}
    assert {p["label"]: p["value"] for p in data["budget_ranges"]}["500k–1M"] == 1
    assert {p["label"]: p["value"] for p in data["popular_styles"]}["Romantic"] == 2
    assert len(data["moodboards_per_week"]) == 8
    assert sum(p["value"] for p in data["moodboards_per_week"]) == 1  # the 20-week-old board is outside the window
    assert data["quotes_by_status"] == [{"label": "new", "value": 1}]


@pytest.mark.parametrize("path", ["/api/admin/overview", "/api/admin/analytics", "/api/admin/consultations"])
def test_admin_oversight_routes_reject_clients(path) -> None:
    client = make_profile(invitation_status="accepted")
    assert client_with(FakeSession(client)).get(path, headers=auth_header(client)).status_code == 403


def test_notes_require_a_client_target() -> None:
    from tests.helpers import make_admin

    admin = make_admin()
    response = client_with(FakeSession(admin)).post(
        f"/api/admin/clients/{uuid.uuid4()}/notes", headers=auth_header(admin), json={"body": "Call back"}
    )
    assert response.status_code == 404
