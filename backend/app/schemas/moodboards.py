from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from app.models import InventoryItem, Moodboard, MoodboardItem
from app.schemas.base import CamelModel
from app.schemas.inventory import InventoryItemOut


class MoodboardItemOut(CamelModel):
    item: InventoryItemOut
    suggested_qty: int | None
    budget_category: str | None
    reason: str | None


class MoodboardOut(CamelModel):
    id: UUID
    event_id: UUID
    title: str
    summary: str | None
    tag: str  # the event's type, e.g. "Mehndi"
    palette: list[str]
    mood: str | None
    style: str | None
    density: str | None
    venue: str | None
    liked: bool
    source: Literal["ai", "rules", "inspiration"]
    created_at: datetime
    items: list[MoodboardItemOut]

    @classmethod
    def build(cls, board: Moodboard, event_type: str, items: list[tuple[MoodboardItem, InventoryItem]]) -> "MoodboardOut":
        return cls(
            id=board.id, event_id=board.event_id, title=board.title, summary=board.summary, tag=event_type,
            palette=board.palette, mood=board.mood, style=board.style, density=board.density, venue=board.venue,
            liked=board.liked, source=board.source, created_at=board.created_at,
            items=[
                MoodboardItemOut(
                    item=InventoryItemOut.from_model(inv), suggested_qty=mi.suggested_qty,
                    budget_category=mi.budget_category, reason=mi.reason,
                )
                for mi, inv in items
            ],
        )


class GenerateRequest(CamelModel):
    """Direction controls from the moodboard viewer. All optional."""

    mood: str | None = Field(default=None, max_length=40)
    style: str | None = Field(default=None, max_length=40)
    density: str | None = Field(default=None, max_length=40)
    venue: str | None = Field(default=None, max_length=40)


class MoodboardUpdate(CamelModel):
    title: str | None = Field(default=None, min_length=1, max_length=80)
    liked: bool | None = None


class BudgetFromMoodboardRequest(CamelModel):
    moodboard_id: UUID | None = None  # default: the event's newest moodboard (one is generated if none)
    replace: bool = False  # must be true to overwrite existing budget lines
