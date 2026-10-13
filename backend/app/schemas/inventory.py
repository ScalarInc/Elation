from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field, field_validator

from app.models import InventoryItem
from app.schemas.base import CamelModel
from app.services.inventory import image_url

Category = Literal[
    "Sofa", "Chair", "Table", "Chandelier", "Floral", "Backdrop", "Prop", "Signage", "Lighting", "Fabric", "Structure"
]
Unit = Literal["each", "set", "linear ft", "sqft"]
MAX_PRICE_PKR = 100_000_000


class InventoryItemOut(CamelModel):
    """What clients see (active items only)."""

    id: UUID
    name: str
    category: Category
    colour: str | None
    material: str | None
    unit: Unit
    price_pkr: int
    tags: list[str]
    image_url: str | None

    @classmethod
    def from_model(cls, item: InventoryItem) -> "InventoryItemOut":
        return cls(**_common(item))


class AdminInventoryItemOut(InventoryItemOut):
    sku: str
    stock_qty: int | None
    is_active: bool
    is_provisional_price: bool
    price_updated_at: datetime | None
    updated_at: datetime

    @classmethod
    def from_model(cls, item: InventoryItem) -> "AdminInventoryItemOut":
        return cls(
            **_common(item),
            sku=item.sku,
            stock_qty=item.stock_qty,
            is_active=item.is_active,
            is_provisional_price=item.is_provisional_price,
            price_updated_at=item.price_updated_at,
            updated_at=item.updated_at,
        )


def _common(item: InventoryItem) -> dict:
    return dict(
        id=item.id, name=item.name, category=item.category, colour=item.colour, material=item.material,
        unit=item.unit, price_pkr=item.price_pkr, tags=item.tags, image_url=image_url(item.image_path),
    )


class _ItemFields(CamelModel):
    @field_validator("tags", check_fields=False)
    @classmethod
    def clean_tags(cls, tags: list[str] | None) -> list[str] | None:
        if tags is None:
            return None
        return sorted({t.strip().lower() for t in tags if t.strip()})


class InventoryCreate(_ItemFields):
    name: str = Field(min_length=2, max_length=120)
    category: Category
    unit: Unit
    price_pkr: int = Field(ge=0, le=MAX_PRICE_PKR)
    colour: str | None = Field(default=None, max_length=60)
    material: str | None = Field(default=None, max_length=60)
    stock_qty: int | None = Field(default=None, ge=0)
    tags: list[str] = Field(default_factory=list, max_length=20)


class InventoryUpdate(_ItemFields):
    """Every field optional; only the ones sent are changed."""

    name: str | None = Field(default=None, min_length=2, max_length=120)
    category: Category | None = None
    unit: Unit | None = None
    price_pkr: int | None = Field(default=None, ge=0, le=MAX_PRICE_PKR)
    colour: str | None = Field(default=None, max_length=60)
    material: str | None = Field(default=None, max_length=60)
    stock_qty: int | None = Field(default=None, ge=0)
    tags: list[str] | None = Field(default=None, max_length=20)
    is_active: bool | None = None


class PriceChangeOut(CamelModel):
    old_price_pkr: int
    new_price_pkr: int
    changed_by_name: str | None
    changed_at: datetime
