from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from app.models import Profile
from app.schemas.base import CamelModel

ClientRole = Literal["Bride", "Groom", "Family", "Organizer"]


def initials(name: str) -> str:
    parts = [p for p in name.split() if p]
    return "".join(p[0] for p in parts[:2]).upper()


class ConsultantSummary(CamelModel):
    id: UUID
    name: str
    email: str
    avatar_initials: str


class MeResponse(CamelModel):
    id: UUID
    role: Literal["admin", "client"]
    is_superuser: bool
    name: str
    email: str
    avatar_initials: str
    phone: str | None
    city: str | None
    client_role: ClientRole | None
    partner_name: str | None
    emergency_contact_name: str | None
    emergency_contact_phone: str | None
    access_expires_at: datetime | None
    notifications: dict
    consultant: ConsultantSummary | None

    @classmethod
    def from_profile(cls, profile: Profile, consultant: Profile | None) -> "MeResponse":
        return cls(
            id=profile.id,
            role=profile.role,
            is_superuser=profile.is_superuser,
            name=profile.full_name,
            email=profile.email,
            avatar_initials=initials(profile.full_name),
            phone=profile.phone,
            city=profile.city,
            client_role=profile.client_role,
            partner_name=profile.partner_name,
            emergency_contact_name=profile.emergency_contact_name,
            emergency_contact_phone=profile.emergency_contact_phone,
            access_expires_at=profile.access_expires_at,
            notifications=profile.notification_prefs,
            consultant=(
                ConsultantSummary(
                    id=consultant.id,
                    name=consultant.full_name,
                    email=consultant.email,
                    avatar_initials=initials(consultant.full_name),
                )
                if consultant
                else None
            ),
        )


class MeUpdate(CamelModel):
    """Editable profile fields. Email changes are not supported (it is the sign-in identity)."""

    name: str = Field(min_length=2, max_length=120)
    phone: str | None = Field(default=None, max_length=40)
    city: str | None = Field(default=None, max_length=80)
    client_role: ClientRole | None = None
    partner_name: str | None = Field(default=None, max_length=120)
    emergency_contact_name: str | None = Field(default=None, max_length=120)
    emergency_contact_phone: str | None = Field(default=None, max_length=40)


class ForgotPasswordRequest(CamelModel):
    email: str = Field(min_length=3, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
