import re
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field, field_validator

from app.models import Inspiration, InspirationItem, InventoryItem
from app.schemas.base import CamelModel
from app.schemas.events import EventType
from app.schemas.inventory import InventoryItemOut
from app.services.inspirations import image_url

BudgetTier = Literal["Intimate", "Signature", "Grand"]
HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")


def _check_palette(palette: list[str] | None) -> list[str] | None:
    if palette is None:
        return None
    bad = [c for c in palette if not HEX.match(c)]
    if bad:
        raise ValueError(f"Colours must be hex like #E3BFB9 (got {', '.join(bad)})")
    return [c.upper() for c in palette]


def _clean_tags(tags: list[str] | None) -> list[str] | None:
    return None if tags is None else [t.strip() for t in tags if t.strip()]


class InspirationItemOut(CamelModel):
    item: InventoryItemOut
    quantity: int


class InspirationOut(CamelModel):
    id: UUID
    slug: str
    name: str
    summary: str | None
    style_tags: list[str]
    event_types: list[str]
    palette: list[str]
    budget_tier: BudgetTier | None
    cover_url: str | None
    image_urls: list[str]
    is_featured: bool
    items: list[InspirationItemOut]

    @classmethod
    def build(cls, insp: Inspiration, rows: list[tuple[InspirationItem, InventoryItem]], include_archived: bool = False):
        return cls(
            id=insp.id, slug=insp.slug, name=insp.name, summary=insp.summary, style_tags=insp.style_tags,
            event_types=insp.event_types, palette=insp.palette, budget_tier=insp.budget_tier,
            cover_url=image_url(insp.cover_image_path), image_urls=[image_url(p) for p in insp.image_paths],
            is_featured=insp.is_featured,
            items=[
                InspirationItemOut(item=InventoryItemOut.from_model(item), quantity=link.quantity)
                for link, item in rows
                if include_archived or item.is_active
            ],
        )


class AdminInspirationOut(InspirationOut):
    is_published: bool
    image_paths: list[str]  # object paths, needed to remove a gallery image
    updated_at: datetime


class InspirationFields(CamelModel):
    summary: str | None = Field(default=None, max_length=1000)
    style_tags: list[str] = Field(default_factory=list, max_length=10)
    event_types: list[EventType] = Field(default_factory=list)
    palette: list[str] = Field(default_factory=list, max_length=8)
    budget_tier: BudgetTier | None = None
    is_featured: bool = False
    is_published: bool = False

    check_palette = field_validator("palette")(_check_palette)
    clean_tags = field_validator("style_tags")(_clean_tags)


class InspirationCreate(InspirationFields):
    name: str = Field(min_length=2, max_length=80)


class InspirationUpdate(CamelModel):
    """Every field optional; only the ones sent are changed."""

    name: str | None = Field(default=None, min_length=2, max_length=80)
    summary: str | None = Field(default=None, max_length=1000)
    style_tags: list[str] | None = Field(default=None, max_length=10)
    event_types: list[EventType] | None = None
    palette: list[str] | None = Field(default=None, max_length=8)
    budget_tier: BudgetTier | None = None
    is_featured: bool | None = None
    is_published: bool | None = None

    check_palette = field_validator("palette")(_check_palette)
    clean_tags = field_validator("style_tags")(_clean_tags)


class InspirationItemIn(CamelModel):
    inventory_item_id: UUID
    quantity: int = Field(ge=1, le=10_000)


class AdoptRequest(CamelModel):
    event_id: UUID


class AdoptResponse(CamelModel):
    moodboard_id: UUID
    event_id: UUID
    budget_drafted: bool


class RecommendedConcept(CamelModel):
    inspiration: InspirationOut
    reason: str
    estimated_cost_pkr: int
