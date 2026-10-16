from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from app.models import ActivityEntry, ConsultationNote
from app.schemas.base import CamelModel
from app.schemas.events import Progress


class ActivityOut(CamelModel):
    """Matches the frontend `ActivityEntry` type."""

    id: UUID
    event_id: UUID | None
    kind: Literal["moodboard", "budget", "note", "system", "ar"]
    title: str
    detail: str | None
    at: datetime

    @classmethod
    def from_model(cls, entry: ActivityEntry) -> "ActivityOut":
        return cls(id=entry.id, event_id=entry.event_id, kind=entry.kind, title=entry.title, detail=entry.detail, at=entry.created_at)


class Overview(CamelModel):
    active_clients: int
    pending_invites: int
    expiring_soon: int
    events: int
    moodboards_this_week: int
    open_quotes: int
    follow_ups_due: int


class Point(CamelModel):
    label: str
    value: int


class Analytics(CamelModel):
    events_by_type: list[Point]
    budget_ranges: list[Point]
    popular_styles: list[Point]
    moodboards_per_week: list[Point]
    quotes_per_week: list[Point]
    quotes_by_status: list[Point]


class ConsultationEvent(CamelModel):
    id: UUID
    name: str
    type: str
    date: datetime
    guests: int
    budget_pkr: int | None
    progress: Progress


class ConsultationQuote(CamelModel):
    id: UUID
    event_id: UUID
    event_name: str
    status: Literal["new", "contacted", "closed"]
    total_pkr: int
    budget_status: str
    item_count: int
    client_note: str | None
    created_at: datetime


class ConsultationRow(CamelModel):
    client_id: UUID
    client_name: str
    client_email: str
    status: Literal["pending", "active", "expired", "revoked"]
    access_expires_at: datetime
    consultant_name: str | None
    events: list[ConsultationEvent]
    quotes: list[ConsultationQuote]
    open_follow_ups: int

    @classmethod
    def build(cls, row: dict) -> "ConsultationRow":
        client = row["client"]
        return cls(
            client_id=client.id, client_name=client.full_name, client_email=client.email, status=row["status"],
            access_expires_at=client.access_expires_at, consultant_name=row["consultant_name"],
            events=[
                ConsultationEvent(id=e["event"].id, name=e["event"].name, type=e["event"].type, date=e["event"].event_date,
                                  guests=e["event"].guest_count, budget_pkr=e["event"].target_budget_pkr,
                                  progress=Progress(**e["progress"]))
                for e in row["events"]
            ],
            quotes=[
                ConsultationQuote(id=q["quote"].id, event_id=q["quote"].event_id, event_name=q["event_name"],
                                  status=q["quote"].status, total_pkr=q["quote"].total_pkr,
                                  budget_status=q["quote"].budget_status, item_count=len(q["quote"].lines_snapshot),
                                  client_note=q["quote"].client_note, created_at=q["quote"].created_at)
                for q in row["quotes"]
            ],
            open_follow_ups=row["open_follow_ups"],
        )


class QuoteStatusUpdate(CamelModel):
    status: Literal["new", "contacted", "closed"]


class NoteIn(CamelModel):
    body: str = Field(min_length=1, max_length=2000)
    event_id: UUID | None = None
    follow_up_at: datetime | None = None


class NoteUpdate(CamelModel):
    completed: bool


class NoteOut(CamelModel):
    id: UUID
    client_id: UUID
    event_id: UUID | None
    author_name: str | None
    body: str
    follow_up_at: datetime | None
    completed_at: datetime | None
    created_at: datetime

    @classmethod
    def from_model(cls, note: ConsultationNote, author_name: str | None) -> "NoteOut":
        return cls(id=note.id, client_id=note.client_id, event_id=note.event_id, author_name=author_name, body=note.body,
                   follow_up_at=note.follow_up_at, completed_at=note.completed_at, created_at=note.created_at)
