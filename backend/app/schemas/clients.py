from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from app.models import Profile
from app.schemas.base import CamelModel
from app.schemas.me import initials
from app.services.clients import InviteResult, client_status

ClientStatus = Literal["pending", "active", "expired", "revoked"]
EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class AdminSummary(CamelModel):
    id: UUID
    name: str
    email: str
    avatar_initials: str

    @classmethod
    def from_profile(cls, profile: Profile) -> "AdminSummary":
        return cls(id=profile.id, name=profile.full_name, email=profile.email, avatar_initials=initials(profile.full_name))


class ClientRow(CamelModel):
    id: UUID
    name: str
    email: str
    avatar_initials: str
    phone: str | None
    city: str | None
    status: ClientStatus
    access_status: Literal["active", "revoked"]
    access_expires_at: datetime
    invitation_status: Literal["pending", "accepted"]
    invited_at: datetime | None
    activated_at: datetime | None
    created_at: datetime
    consultant: AdminSummary | None
    event_count: int

    @classmethod
    def build(cls, profile: Profile, consultant: Profile | None, event_count: int) -> "ClientRow":
        return cls(
            id=profile.id,
            name=profile.full_name,
            email=profile.email,
            avatar_initials=initials(profile.full_name),
            phone=profile.phone,
            city=profile.city,
            status=client_status(profile),
            access_status=profile.access_status,
            access_expires_at=profile.access_expires_at,
            invitation_status=profile.invitation_status,
            invited_at=profile.invited_at,
            activated_at=profile.activated_at,
            created_at=profile.created_at,
            consultant=AdminSummary.from_profile(consultant) if consultant else None,
            event_count=event_count,
        )


class ClientCreate(CamelModel):
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(max_length=254, pattern=EMAIL_PATTERN)
    phone: str | None = Field(default=None, max_length=40)
    city: str | None = Field(default=None, max_length=80)
    access_days: int | None = Field(default=None, ge=1, le=365)


class ClientUpdate(CamelModel):
    """Every field is optional; only the ones sent are changed."""

    name: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = Field(default=None, max_length=40)
    city: str | None = Field(default=None, max_length=80)
    access_expires_at: datetime | None = None
    access_status: Literal["active", "revoked"] | None = None
    consultant_id: UUID | None = None


class InviteResponse(CamelModel):
    client: ClientRow
    invite_link: str
    email_sent: bool
    email_error: str | None

    @classmethod
    def build(cls, client: ClientRow, result: InviteResult) -> "InviteResponse":
        return cls(client=client, invite_link=result.invite_link, email_sent=result.email_sent, email_error=result.email_error)
