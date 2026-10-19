"""Events and questionnaire persistence. Clients only ever see their own events."""

import json
from datetime import UTC, date, datetime, time
from typing import Any
from uuid import UUID

from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.constants import EVENT_TYPES, VENUE_SETTINGS
from app.errors import ApiError
from app.models import BudgetLine, Event, Moodboard, QuestionnaireResponse, QuoteRequest

# Questionnaire answers that also update the event's own columns, so server-side features
# (budget, recommendations) see the same values the client entered. Mirrors the frontend's
# `resolveEvent` in lib/questionnaire/derived.ts.
BUDGET_BAND_MIDPOINTS_PKR = {
    "Under PKR 250,000": 200_000,
    "PKR 250,000–500,000": 375_000,
    "PKR 500,000–1M": 750_000,
    "PKR 1M–2M": 1_500_000,
    "PKR 2M–5M": 3_500_000,
    "PKR 5M+": 7_500_000,
}

MAX_ANSWERS_BYTES = 200_000


def get_own_event(db: Session, client_id: UUID, event_id: UUID) -> Event:
    event = db.get(Event, event_id)
    if event is None or event.client_id != client_id:
        raise ApiError(404, "NOT_FOUND", "Event not found.")  # same answer for "not yours"
    return event


def event_status(event: Event, today: date | None = None) -> str:
    today = today or datetime.now(UTC).date()
    return "past" if event.event_date.date() < today else event.status


def module_progress(db: Session, event: Event) -> dict[str, str]:
    return progress_for(db, [event])[event.id]


def progress_for(db: Session, events: list[Event]) -> dict[UUID, dict[str, str]]:
    """Derived per request; nothing extra is stored. One query for any number of events
    (the database is far away, so every round trip counts)."""
    if not events:
        return {}

    def has(model, *conditions):
        return exists().where(model.event_id == Event.id, *conditions).correlate(Event)

    rows = db.execute(
        select(
            Event.id,
            has(Moodboard, Moodboard.liked.is_(True)),
            has(Moodboard),
            has(QuoteRequest),
            has(BudgetLine),
        ).where(Event.id.in_([e.id for e in events]))
    ).all()
    flags = {row[0]: row[1:] for row in rows}

    result = {}
    for event in events:
        liked_board, any_board, any_quote, any_line = flags.get(event.id, (False, False, False, False))
        percent = event.questionnaire_percent
        result[event.id] = {
            "questionnaire": "pending" if percent == 0 else "complete" if percent >= 100 else "in_progress",
            "moodboard": "complete" if liked_board else "in_progress" if any_board else "pending",
            "budget": "complete" if any_quote else "in_progress" if any_line else "pending",
            "ar": "pending",
        }
    return result


def to_event_datetime(day: date) -> datetime:
    return datetime.combine(day, time(12, 0), tzinfo=UTC)  # midday UTC: same calendar day everywhere


def answers_with_event_defaults(event: Event, answers: dict[str, Any]) -> dict[str, Any]:
    """Pre-fill the Event Basics questions from what the client entered when creating the event,
    so the questionnaire never asks for the same thing twice. Saved answers always win."""
    defaults = {
        "q1_type": event.type,
        "q2_name": event.concept or event.name,
        "q3_date": event.event_date.date().isoformat(),
        "q4_guests": event.guest_count,
        "q5_venue": event.venue_name,
    }
    merged = dict(answers)
    for key, value in defaults.items():
        if merged.get(key) in (None, "") and value not in (None, ""):
            merged[key] = value
    return merged


def apply_answers_to_event(event: Event, answers: dict[str, Any]) -> None:
    def text(key: str) -> str | None:
        value = answers.get(key)
        return value.strip() if isinstance(value, str) and value.strip() else None

    if (value := text("q2_name")) is not None:
        event.concept = value
    if (value := text("q1_type")) in EVENT_TYPES:
        event.type = value
    if (value := text("q3_date")) is not None:
        try:
            event.event_date = to_event_datetime(date.fromisoformat(value[:10]))
        except ValueError:
            pass
    guests = answers.get("q4_guests")
    if isinstance(guests, int) and not isinstance(guests, bool) and guests > 0:
        event.guest_count = guests
    if (value := text("q5_venue")) is not None:
        event.venue_name = value
    if (value := text("q6_indoor")) in VENUE_SETTINGS:
        event.venue_setting = value
    if (value := text("q121_budget")) in BUDGET_BAND_MIDPOINTS_PKR:
        event.target_budget_pkr = BUDGET_BAND_MIDPOINTS_PKR[value]


def save_questionnaire(
    db: Session, event: Event, answers: dict[str, Any], elation_decides: dict[str, bool], percent: int
) -> QuestionnaireResponse:
    if len(json.dumps(answers)) > MAX_ANSWERS_BYTES:
        raise ApiError(400, "VALIDATION_FAILED", "Questionnaire answers are too large.")

    response = db.get(QuestionnaireResponse, event.id)
    if response is None:
        response = QuestionnaireResponse(event_id=event.id)
        db.add(response)
    response.answers = answers
    response.elation_decides = {k: bool(v) for k, v in elation_decides.items()}
    response.updated_at = datetime.now(UTC)

    event.questionnaire_percent = percent
    if percent > 0 and event.status == "draft":
        event.status = "active"
    apply_answers_to_event(event, answers)
    db.commit()
    return response
