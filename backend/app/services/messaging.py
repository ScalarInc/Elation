"""Messaging: one persistent thread per client (messages.client_id is the thread key).

Sends always go through the API (validated here). Live delivery happens through Supabase
Realtime, which only pushes rows the subscriber's RLS policy allows (see the initial migration).
"""

from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.constants import MESSAGE_MAX_LENGTH
from app.errors import ApiError
from app.models import ActivityEntry, Message, Profile

PAGE_SIZE = 50


def history(db: Session, client_id: UUID, before: datetime | None = None, limit: int = PAGE_SIZE) -> list[Message]:
    """Up to `limit` messages older than `before`, returned oldest first."""
    query = select(Message).where(Message.client_id == client_id)
    if before is not None:
        query = query.where(Message.created_at < before)
    newest_first = list(db.scalars(query.order_by(Message.created_at.desc()).limit(limit)))
    return list(reversed(newest_first))


def send(db: Session, client_id: UUID, sender: Profile, body: str) -> Message:
    text = body.strip()
    if not text:
        raise ApiError(400, "VALIDATION_FAILED", "Message can't be empty.")
    if len(text) > MESSAGE_MAX_LENGTH:
        raise ApiError(400, "VALIDATION_FAILED", f"Messages can be at most {MESSAGE_MAX_LENGTH} characters.")
    message = Message(client_id=client_id, sender_id=sender.id, sender_role=sender.role, body=text)
    db.add(message)
    if sender.role == "admin":
        db.add(ActivityEntry(client_id=client_id, actor_id=sender.id, kind="note",
                             title=f"New message from {sender.full_name}", detail=text[:140]))
    db.commit()
    db.refresh(message)
    return message


def sender_names(db: Session, messages: list[Message]) -> dict[UUID, str]:
    ids = {m.sender_id for m in messages if m.sender_id}
    if not ids:
        return {}
    return dict(db.execute(select(Profile.id, Profile.full_name).where(Profile.id.in_(ids))).all())


def conversations(db: Session) -> list[tuple[Profile, Message | None, int]]:
    """Every client with their newest message and message count, most recent activity first."""
    latest = (
        select(Message.client_id, func.max(Message.created_at).label("at"), func.count().label("total"))
        .group_by(Message.client_id)
        .subquery()
    )
    rows = db.execute(
        select(Profile, latest.c.at, latest.c.total)
        .outerjoin(latest, latest.c.client_id == Profile.id)
        .where(Profile.role == "client")
    ).all()
    result = []
    for profile, at, total in rows:
        last = None
        if at is not None:
            last = db.scalar(select(Message).where(Message.client_id == profile.id, Message.created_at == at).limit(1))
        result.append((profile, last, total or 0))
    # Threads with messages first (newest on top), then clients who haven't written yet.
    return sorted(result, key=lambda r: (r[1] is None, -(r[1].created_at.timestamp() if r[1] else 0), r[0].full_name))
