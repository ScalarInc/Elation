"""Admin oversight: dashboard numbers, analytics, consultation tracking and follow-up notes."""

from collections import Counter
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import ConsultationNote, Event, Moodboard, Profile, QuoteRequest
from app.services.clients import client_status
from app.services.events import module_progress

EXPIRING_WINDOW = timedelta(days=7)

# Target-budget buckets for the analytics chart (PKR).
BUDGET_BUCKETS = [
    ("Under 500k", 0, 500_000),
    ("500k–1M", 500_000, 1_000_000),
    ("1M–2M", 1_000_000, 2_000_000),
    ("2M–5M", 2_000_000, 5_000_000),
    ("5M+", 5_000_000, None),
]


def _counts(counter: Counter, limit: int | None = None) -> list[dict]:
    return [{"label": label, "value": value} for label, value in counter.most_common(limit)]


def overview(db: Session, now: datetime | None = None) -> dict:
    now = now or datetime.now(UTC)
    clients = list(db.scalars(select(Profile).where(Profile.role == "client")))
    statuses = Counter(client_status(c, now) for c in clients)
    expiring = sum(
        1 for c in clients
        if client_status(c, now) == "active" and c.access_expires_at and c.access_expires_at <= now + EXPIRING_WINDOW
    )
    open_quotes = db.scalar(select(func.count()).select_from(QuoteRequest).where(QuoteRequest.status != "closed")) or 0
    week_ago = now - timedelta(days=7)
    moodboards_week = db.scalar(select(func.count()).select_from(Moodboard).where(Moodboard.created_at >= week_ago)) or 0
    due = db.scalar(
        select(func.count()).select_from(ConsultationNote).where(
            ConsultationNote.completed_at.is_(None), ConsultationNote.follow_up_at.is_not(None),
            ConsultationNote.follow_up_at <= now + timedelta(days=1),
        )
    ) or 0
    return {
        "active_clients": statuses["active"],
        "pending_invites": statuses["pending"],
        "expiring_soon": expiring,
        "events": db.scalar(select(func.count()).select_from(Event)) or 0,
        "moodboards_this_week": moodboards_week,
        "open_quotes": open_quotes,
        "follow_ups_due": due,
    }


def analytics(db: Session, now: datetime | None = None, weeks: int = 8) -> dict:
    now = now or datetime.now(UTC)
    events = list(db.scalars(select(Event)))
    moodboards = list(db.scalars(select(Moodboard)))
    quotes = list(db.scalars(select(QuoteRequest)))

    budget_ranges = Counter()
    for e in events:
        if not e.target_budget_pkr:
            continue
        for label, low, high in BUDGET_BUCKETS:
            if e.target_budget_pkr >= low and (high is None or e.target_budget_pkr < high):
                budget_ranges[label] += 1
    styles = Counter()
    for m in moodboards:
        for value in (m.style, m.mood):
            for part in (value or "").split(" · "):
                if part.strip():
                    styles[part.strip()] += 1

    start = (now - timedelta(weeks=weeks - 1)).date()
    start -= timedelta(days=start.weekday())  # Monday of the first week
    week_labels = [start + timedelta(weeks=i) for i in range(weeks)]

    def per_week(dates: list[datetime]) -> list[dict]:
        counts = Counter((d.date() - start).days // 7 for d in dates if d.date() >= start)
        return [{"label": w.strftime("%d %b"), "value": counts.get(i, 0)} for i, w in enumerate(week_labels)]

    return {
        "events_by_type": _counts(Counter(e.type for e in events)),
        "budget_ranges": [{"label": label, "value": budget_ranges.get(label, 0)} for label, _, _ in BUDGET_BUCKETS],
        "popular_styles": _counts(styles, limit=8),
        "moodboards_per_week": per_week([m.created_at for m in moodboards]),
        "quotes_per_week": per_week([q.created_at for q in quotes]),
        "quotes_by_status": _counts(Counter(q.status for q in quotes)),
    }


def consultations(db: Session) -> list[dict]:
    """One row per client: access status, each event's progress, quotes and open follow-ups."""
    clients = list(db.scalars(select(Profile).where(Profile.role == "client").order_by(Profile.full_name)))
    if not clients:
        return []
    ids = [c.id for c in clients]
    events_by_client: dict[UUID, list[Event]] = {i: [] for i in ids}
    for e in db.scalars(select(Event).where(Event.client_id.in_(ids)).order_by(Event.event_date)):
        events_by_client[e.client_id].append(e)
    quotes_by_client: dict[UUID, list[QuoteRequest]] = {i: [] for i in ids}
    for q in db.scalars(select(QuoteRequest).where(QuoteRequest.client_id.in_(ids)).order_by(QuoteRequest.created_at.desc())):
        quotes_by_client[q.client_id].append(q)
    open_notes = Counter(
        n.client_id for n in db.scalars(
            select(ConsultationNote).where(ConsultationNote.client_id.in_(ids), ConsultationNote.completed_at.is_(None),
                                           ConsultationNote.follow_up_at.is_not(None))
        )
    )
    admins = {p.id: p.full_name for p in db.scalars(select(Profile).where(Profile.role == "admin"))}
    event_names = {e.id: e.name for evs in events_by_client.values() for e in evs}

    return [
        {
            "client": client,
            "status": client_status(client),
            "consultant_name": admins.get(client.assigned_admin_id),
            "events": [{"event": e, "progress": module_progress(db, e)} for e in events_by_client[client.id]],
            "quotes": [{"quote": q, "event_name": event_names.get(q.event_id, "")} for q in quotes_by_client[client.id]],
            "open_follow_ups": open_notes.get(client.id, 0),
        }
        for client in clients
    ]
