from uuid import UUID

from fastapi import APIRouter, UploadFile
from sqlalchemy import select

from app.deps import CurrentAdmin, CurrentUser, DbSession
from app.errors import ApiError
from app.models import InventoryItem, InventoryPriceHistory, Profile
from app.schemas.inventory import (
    AdminInventoryItemOut,
    InventoryCreate,
    InventoryItemOut,
    InventoryUpdate,
    PriceChangeOut,
)
from app.services import inventory as inventory_service

client_router = APIRouter(prefix="/inventory", tags=["inventory"])
admin_router = APIRouter(prefix="/admin/inventory", tags=["admin: inventory"])

_ORDER = (InventoryItem.category, InventoryItem.name)


def _get_item(db: DbSession, item_id: UUID) -> InventoryItem:
    item = db.get(InventoryItem, item_id)
    if item is None:
        raise ApiError(404, "NOT_FOUND", "Inventory item not found.")
    return item


def _optional_text(value: str | None) -> str | None:
    return (value or "").strip() or None


# ---------- clients (read-only, active items) ----------


@client_router.get("", response_model=list[InventoryItemOut])
def list_inventory(_: CurrentUser, db: DbSession) -> list[InventoryItemOut]:
    items = db.scalars(select(InventoryItem).where(InventoryItem.is_active.is_(True)).order_by(*_ORDER))
    return [InventoryItemOut.from_model(i) for i in items]


@client_router.get("/{item_id}", response_model=InventoryItemOut)
def get_inventory_item(item_id: UUID, _: CurrentUser, db: DbSession) -> InventoryItemOut:
    item = _get_item(db, item_id)
    if not item.is_active:
        raise ApiError(404, "NOT_FOUND", "Inventory item not found.")
    return InventoryItemOut.from_model(item)


# ---------- admins ----------


@admin_router.get("", response_model=list[AdminInventoryItemOut])
def admin_list_inventory(_: CurrentAdmin, db: DbSession) -> list[AdminInventoryItemOut]:
    return [AdminInventoryItemOut.from_model(i) for i in db.scalars(select(InventoryItem).order_by(*_ORDER))]


@admin_router.post("", response_model=AdminInventoryItemOut, status_code=201)
def create_inventory_item(payload: InventoryCreate, admin: CurrentAdmin, db: DbSession) -> AdminInventoryItemOut:
    item = InventoryItem(
        sku=inventory_service.make_sku(db, payload.name),
        name=payload.name.strip(),
        category=payload.category,
        unit=payload.unit,
        price_pkr=payload.price_pkr,
        colour=_optional_text(payload.colour),
        material=_optional_text(payload.material),
        stock_qty=payload.stock_qty,
        tags=payload.tags,
        price_updated_by=admin.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return AdminInventoryItemOut.from_model(item)


@admin_router.patch("/{item_id}", response_model=AdminInventoryItemOut)
def update_inventory_item(item_id: UUID, payload: InventoryUpdate, admin: CurrentAdmin, db: DbSession) -> AdminInventoryItemOut:
    item = _get_item(db, item_id)
    sent = payload.model_fields_set

    for field in ("name", "category", "unit", "is_active"):
        if field in sent and getattr(payload, field) is not None:
            value = getattr(payload, field)
            setattr(item, field, value.strip() if isinstance(value, str) else value)
    for field in ("colour", "material"):
        if field in sent:
            setattr(item, field, _optional_text(getattr(payload, field)))
    if "stock_qty" in sent:
        item.stock_qty = payload.stock_qty
    if "tags" in sent and payload.tags is not None:
        item.tags = payload.tags
    if "price_pkr" in sent and payload.price_pkr is not None:
        inventory_service.change_price(db, item, payload.price_pkr, admin)

    db.commit()
    db.refresh(item)
    return AdminInventoryItemOut.from_model(item)


@admin_router.get("/{item_id}/price-history", response_model=list[PriceChangeOut])
def price_history(item_id: UUID, _: CurrentAdmin, db: DbSession) -> list[PriceChangeOut]:
    _get_item(db, item_id)
    rows = db.execute(
        select(InventoryPriceHistory, Profile.full_name)
        .outerjoin(Profile, Profile.id == InventoryPriceHistory.changed_by)
        .where(InventoryPriceHistory.inventory_item_id == item_id)
        .order_by(InventoryPriceHistory.changed_at.desc())
    )
    return [
        PriceChangeOut(old_price_pkr=h.old_price_pkr, new_price_pkr=h.new_price_pkr, changed_by_name=name, changed_at=h.changed_at)
        for h, name in rows
    ]


@admin_router.post("/{item_id}/image", response_model=AdminInventoryItemOut)
async def upload_inventory_image(item_id: UUID, file: UploadFile, _: CurrentAdmin, db: DbSession) -> AdminInventoryItemOut:
    item = _get_item(db, item_id)
    content = await file.read(inventory_service.MAX_IMAGE_BYTES + 1)
    item.image_path = inventory_service.upload_image(item, content, file.content_type or "")
    db.commit()
    db.refresh(item)
    return AdminInventoryItemOut.from_model(item)
