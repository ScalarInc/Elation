from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Query

from app.deps import CurrentAdmin, CurrentClient, DbSession
from app.errors import ApiError
from app.models import Profile
from app.schemas.messages import ConversationOut, MessageIn, MessageOut
from app.services import messaging

router = APIRouter(tags=["messages"])


def _out(db: DbSession, messages: list) -> list[MessageOut]:
    names = messaging.sender_names(db, messages)
    return [MessageOut.build(m, names) for m in messages]


def _client(db: DbSession, client_id: UUID) -> Profile:
    profile = db.get(Profile, client_id)
    if profile is None or profile.role != "client":
        raise ApiError(404, "NOT_FOUND", "Client not found.")
    return profile


# ---------- client: own thread ----------


@router.get("/messages", response_model=list[MessageOut])
def my_messages(
    user: CurrentClient, db: DbSession, before: datetime | None = None, limit: int = Query(default=50, ge=1, le=100)
) -> list[MessageOut]:
    return _out(db, messaging.history(db, user.id, before, limit))


@router.post("/messages", response_model=MessageOut, status_code=201)
def send_message(payload: MessageIn, user: CurrentClient, db: DbSession) -> MessageOut:
    return _out(db, [messaging.send(db, user.id, user, payload.body)])[0]


# ---------- admins: every client thread ----------


@router.get("/admin/conversations", response_model=list[ConversationOut])
def conversations(_: CurrentAdmin, db: DbSession) -> list[ConversationOut]:
    rows = messaging.conversations(db)
    names = messaging.sender_names(db, [last for _, last, _ in rows if last])
    return [ConversationOut.build(client, last, count, names) for client, last, count in rows]


@router.get("/admin/clients/{client_id}/messages", response_model=list[MessageOut])
def client_messages(
    client_id: UUID, _: CurrentAdmin, db: DbSession, before: datetime | None = None,
    limit: int = Query(default=50, ge=1, le=100),
) -> list[MessageOut]:
    return _out(db, messaging.history(db, _client(db, client_id).id, before, limit))


@router.post("/admin/clients/{client_id}/messages", response_model=MessageOut, status_code=201)
def reply(
    client_id: UUID, payload: MessageIn, admin: CurrentAdmin, db: DbSession, background: BackgroundTasks
) -> MessageOut:
    client = _client(db, client_id)
    message = messaging.send(db, client.id, admin, payload.body)
    if messaging.should_email_reply(db, client, message):
        background.add_task(messaging.email_reply_notice, client.email, client.full_name, admin.full_name)
    return _out(db, [message])[0]
