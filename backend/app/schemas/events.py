from datetime import date as Date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import Field

from app.models import Event
from app.schemas.base import CamelModel

EventType = Literal[
    "Mehndi", "Mayoun", "Baraat", "Walima", "Nikkah", "Engagement", "Birthday", "Corporate Event", "Milad",
    "Qawwali", "Dinner", "Bridal Shower", "Baby Shower", "Anniversary", "Other",
]
VenueSetting = Literal["Indoor", "Outdoor", "Both"]
ModuleStatus = Literal["complete", "in_progress", "pending"]


class Venue(CamelModel):
    name: str
    city: str
    indoor: VenueSetting


class Progress(CamelModel):
    questionnaire: ModuleStatus
    moodboard: ModuleStatus
    budget: ModuleStatus
    ar: ModuleStatus


class EventOut(CamelModel):
    """Matches the frontend `ClientEvent` type."""

    id: UUID
    client_id: UUID
    name: str
    type: EventType
    concept: str | None
    date: datetime
    venue: Venue
    guests: int
    budget_pkr: int | None
    cover_image: str | None
    progress: Progress
    status: Literal["draft", "active", "past"]

    @classmethod
    def build(cls, event: Event, progress: dict[str, str], status: str) -> "EventOut":
        return cls(
            id=event.id, client_id=event.client_id, name=event.name, type=event.type, concept=event.concept,
            date=event.event_date,
            venue=Venue(name=event.venue_name, city=event.venue_city, indoor=event.venue_setting),
            guests=event.guest_count, budget_pkr=event.target_budget_pkr, cover_image=event.cover_image_path,
            progress=Progress(**progress), status=status,
        )


class EventCreate(CamelModel):
    name: str = Field(min_length=2, max_length=120)
    type: EventType
    date: Date
    venue_name: str = Field(min_length=2, max_length=120)
    city: str = Field(min_length=2, max_length=80)
    guests: int = Field(ge=1, le=100_000)
    venue_setting: VenueSetting = "Both"
    budget_pkr: int | None = Field(default=None, ge=0)


class EventUpdate(CamelModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    type: EventType | None = None
    date: Date | None = None
    venue_name: str | None = Field(default=None, min_length=2, max_length=120)
    city: str | None = Field(default=None, min_length=2, max_length=80)
    guests: int | None = Field(default=None, ge=1, le=100_000)
    venue_setting: VenueSetting | None = None
    budget_pkr: int | None = Field(default=None, ge=0)


class QuestionnaireIn(CamelModel):
    answers: dict[str, Any]
    elation_decides: dict[str, bool] = Field(default_factory=dict)
    percent: int = Field(ge=0, le=100)


class QuestionnaireOut(CamelModel):
    answers: dict[str, Any]
    elation_decides: dict[str, bool]
    percent: int
    updated_at: datetime | None
