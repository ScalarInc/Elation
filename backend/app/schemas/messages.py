from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from app.constants import MESSAGE_MAX_LENGTH
from app.models import Message, Profile
from app.schemas.base import CamelModel
from app.schemas.me import initials


class MessageOut(CamelModel):
    id: UUID
    client_id: UUID
    sender_id: UUID | None
    sender_role: Literal["client", "admin"]
    sender_name: str
    body: str
    created_at: datetime

    @classmethod
    def build(cls, message: Message, names: dict[UUID, str]) -> "MessageOut":
        fallback = "Elation" if message.sender_role == "admin" else "Client"
        return cls(
            id=message.id, client_id=message.client_id, sender_id=message.sender_id, sender_role=message.sender_role,
            sender_name=names.get(message.sender_id, fallback), body=message.body, created_at=message.created_at,
        )


class MessageIn(CamelModel):
    body: str = Field(min_length=1, max_length=MESSAGE_MAX_LENGTH)


class ConversationOut(CamelModel):
    client_id: UUID
    client_name: str
    client_email: str
    avatar_initials: str
    last_message: MessageOut | None
    message_count: int

    @classmethod
    def build(cls, client: Profile, last: Message | None, count: int, names: dict[UUID, str]) -> "ConversationOut":
        return cls(
            client_id=client.id, client_name=client.full_name, client_email=client.email,
            avatar_initials=initials(client.full_name),
            last_message=MessageOut.build(last, names) if last else None, message_count=count,
        )
