"""Event ownership, status and questionnaire → event syncing (no database)."""

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest

from app.errors import ApiError
from app.models import Event
from app.services import events
from tests.helpers import FakeSession, auth_header, client_with, make_admin, make_profile, use_local_jwks


@pytest.fixture(autouse=True)
def local_jwks(monkeypatch):
    use_local_jwks(monkeypatch)


def make_event(client_id, **overrides) -> Event:
    values = dict(
        id=uuid.uuid4(), client_id=client_id, name="Mehndi night", type="Mehndi", concept=None,
        event_date=datetime.now(UTC) + timedelta(days=60), venue_name="Garden", venue_city="Lahore",
        venue_setting="Both", guest_count=200, target_budget_pkr=None, status="draft", questionnaire_percent=0,
    )
    values.update(overrides)
    return Event(**values)


def test_clients_cannot_read_other_clients_events() -> None:
    owner, other = make_profile(), make_profile()
    event = make_event(owner.id)
    with pytest.raises(ApiError) as exc:
        events.get_own_event(FakeSession(event), other.id, event.id)
    assert exc.value.status_code == 404


def test_admins_are_kept_out_of_client_event_routes() -> None:
    admin = make_admin()
    response = client_with(FakeSession(admin)).get("/api/events", headers=auth_header(admin))
    assert response.status_code == 403


def test_status_becomes_past_after_the_event_date() -> None:
    event = make_event(uuid.uuid4(), event_date=datetime(2026, 1, 1, 12, tzinfo=UTC), status="active")
    assert events.event_status(event, today=date(2026, 1, 2)) == "past"
    assert events.event_status(event, today=date(2026, 1, 1)) == "active"


def test_answers_update_event_columns() -> None:
    event = make_event(uuid.uuid4())
    events.apply_answers_to_event(
        event,
        {
            "q1_type": "Walima", "q2_name": " Garden of Light ", "q3_date": "2026-12-20", "q4_guests": 350,
            "q5_venue": "Lawn", "q6_indoor": "Outdoor", "q121_budget": "PKR 2M–5M",
        },
    )
    assert (event.type, event.concept, event.guest_count, event.venue_name, event.venue_setting) == (
        "Walima", "Garden of Light", 350, "Lawn", "Outdoor"
    )
    assert event.event_date.date() == date(2026, 12, 20)
    assert event.target_budget_pkr == 3_500_000


def test_invalid_answers_leave_event_unchanged() -> None:
    event = make_event(uuid.uuid4())
    events.apply_answers_to_event(
        event, {"q1_type": "Spaceship", "q3_date": "soon", "q4_guests": True, "q6_indoor": "Moon", "q121_budget": "Prefer Not to Say"}
    )
    assert (event.type, event.guest_count, event.venue_setting, event.target_budget_pkr) == ("Mehndi", 200, "Both", None)


def test_oversized_answers_rejected() -> None:
    event = make_event(uuid.uuid4())
    with pytest.raises(ApiError):
        events.save_questionnaire(FakeSession(), event, {"q12_theme": "x" * 250_000}, {}, 10)


def test_questionnaire_prefills_basics_from_the_event() -> None:
    event = make_event(uuid.uuid4(), name="Ali Taha's Wedding", concept=None, type="Baraat", guest_count=350,
                       venue_name="Pearl Hall", event_date=datetime(2026, 12, 20, 12, tzinfo=UTC))
    answers = events.answers_with_event_defaults(event, {"q10_aesthetic": ["Regal"]})
    assert answers["q1_type"] == "Baraat" and answers["q2_name"] == "Ali Taha's Wedding"
    assert answers["q3_date"] == "2026-12-20" and answers["q4_guests"] == 350 and answers["q5_venue"] == "Pearl Hall"
    assert answers["q10_aesthetic"] == ["Regal"]
    assert "q6_indoor" not in answers  # never asked at creation, so not guessed


def test_saved_answers_win_over_event_defaults() -> None:
    event = make_event(uuid.uuid4(), guest_count=200)
    assert events.answers_with_event_defaults(event, {"q4_guests": 500})["q4_guests"] == 500
