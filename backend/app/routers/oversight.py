from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import CurrentAdmin, CurrentClient, DbSession
from app.errors import ApiError
from app.models import ActivityEntry, ConsultationNote, Event, Profile, QuoteRequest
from app.schemas.oversight import (
    ActivityOut,
    Analytics,
    ConsultationQuote,
    ConsultationRow,
    NoteIn,
    NoteOut,
    NoteUpdate,
    Overview,
    QuoteStatusUpdate,
)
from app.services import oversight

router = APIRouter(tags=["oversight"])


def _client(db: Session, client_id: UUID) -> Profile:
    profile = db.get(Profile, client_id)
    if profile is None or profile.role != "client":
        raise ApiError(404, "NOT_FOUND", "Client not found.")
    return profile


def _note_out(db: Session, note: ConsultationNote) -> NoteOut:
    author = db.get(Profile, note.author_id) if note.author_id else None
    return NoteOut.from_model(note, author.full_name if author else None)


# ---------- client activity feed ----------


@router.get("/activity", response_model=list[ActivityOut])
def activity(
    user: CurrentClient, db: DbSession, event_id: UUID | None = Query(default=None, alias="eventId"),
    limit: int = Query(default=20, ge=1, le=100),
) -> list[ActivityOut]:
    query = select(ActivityEntry).where(ActivityEntry.client_id == user.id)
    if event_id:
        query = query.where(ActivityEntry.event_id == event_id)
    return [ActivityOut.from_model(a) for a in db.scalars(query.order_by(ActivityEntry.created_at.desc()).limit(limit))]


# ---------- admin dashboard + analytics ----------


@router.get("/admin/overview", response_model=Overview)
def admin_overview(_: CurrentAdmin, db: DbSession) -> Overview:
    return Overview(**oversight.overview(db))


@router.get("/admin/analytics", response_model=Analytics)
def admin_analytics(_: CurrentAdmin, db: DbSession) -> Analytics:
    return Analytics(**oversight.analytics(db))


@router.get("/admin/activity", response_model=list[ActivityOut])
def admin_activity(_: CurrentAdmin, db: DbSession, limit: int = Query(default=15, ge=1, le=100)) -> list[ActivityOut]:
    return [ActivityOut.from_model(a) for a in db.scalars(select(ActivityEntry).order_by(ActivityEntry.created_at.desc()).limit(limit))]


# ---------- consultations ----------


@router.get("/admin/consultations", response_model=list[ConsultationRow])
def admin_consultations(_: CurrentAdmin, db: DbSession) -> list[ConsultationRow]:
    return [ConsultationRow.build(row) for row in oversight.consultations(db)]


@router.patch("/admin/quote-requests/{quote_id}", response_model=ConsultationQuote)
def update_quote(quote_id: UUID, payload: QuoteStatusUpdate, _: CurrentAdmin, db: DbSession) -> ConsultationQuote:
    quote = db.get(QuoteRequest, quote_id)
    if quote is None:
        raise ApiError(404, "NOT_FOUND", "Quote request not found.")
    quote.status = payload.status
    db.commit()
    event = db.get(Event, quote.event_id)
    return ConsultationQuote(id=quote.id, event_id=quote.event_id, event_name=event.name if event else "", status=quote.status,
                             total_pkr=quote.total_pkr, budget_status=quote.budget_status,
                             item_count=len(quote.lines_snapshot), client_note=quote.client_note, created_at=quote.created_at)


# ---------- follow-up notes ----------


@router.get("/admin/clients/{client_id}/notes", response_model=list[NoteOut])
def list_notes(client_id: UUID, _: CurrentAdmin, db: DbSession) -> list[NoteOut]:
    client = _client(db, client_id)
    notes = db.scalars(select(ConsultationNote).where(ConsultationNote.client_id == client.id).order_by(ConsultationNote.created_at.desc()))
    return [_note_out(db, n) for n in notes]


@router.post("/admin/clients/{client_id}/notes", response_model=NoteOut, status_code=201)
def add_note(client_id: UUID, payload: NoteIn, admin: CurrentAdmin, db: DbSession) -> NoteOut:
    client = _client(db, client_id)
    if payload.event_id:
        event = db.get(Event, payload.event_id)
        if event is None or event.client_id != client.id:
            raise ApiError(400, "VALIDATION_FAILED", "That event belongs to a different client.")
    if payload.follow_up_at and payload.follow_up_at.tzinfo is None:
        raise ApiError(400, "VALIDATION_FAILED", "followUpAt must include a timezone.")
    note = ConsultationNote(client_id=client.id, event_id=payload.event_id, author_id=admin.id, body=payload.body.strip(),
                            follow_up_at=payload.follow_up_at)
    db.add(note)
    db.commit()
    db.refresh(note)
    return _note_out(db, note)


@router.patch("/admin/notes/{note_id}", response_model=NoteOut)
def update_note(note_id: UUID, payload: NoteUpdate, _: CurrentAdmin, db: DbSession) -> NoteOut:
    note = db.get(ConsultationNote, note_id)
    if note is None:
        raise ApiError(404, "NOT_FOUND", "Note not found.")
    note.completed_at = datetime.now(UTC) if payload.completed else None
    db.commit()
    return _note_out(db, note)
