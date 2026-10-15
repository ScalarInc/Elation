"""Inventory: admin edits, price history and image storage. Budgets always read the live `price_pkr`."""

import re
import secrets
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import InventoryItem, InventoryPriceHistory, Profile
from app.services import storage

IMAGE_BUCKET = "inventory-images"
MAX_IMAGE_BYTES = storage.MAX_IMAGE_BYTES


def image_url(path: str | None) -> str | None:
    return storage.public_url(IMAGE_BUCKET, path)


def make_sku(db: Session, name: str) -> str:
    """Readable unique SKU from the name; a short suffix keeps duplicate names apart."""
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40] or "item"
    while True:
        sku = f"{base}-{secrets.token_hex(2)}"
        if db.scalar(select(InventoryItem.id).where(InventoryItem.sku == sku)) is None:
            return sku


def change_price(db: Session, item: InventoryItem, new_price: int, admin: Profile) -> None:
    """Record the change, then apply it. The first real edit clears the provisional flag."""
    if new_price == item.price_pkr and not item.is_provisional_price:
        return
    db.add(
        InventoryPriceHistory(
            inventory_item_id=item.id, old_price_pkr=item.price_pkr, new_price_pkr=new_price, changed_by=admin.id
        )
    )
    item.price_pkr = new_price
    item.is_provisional_price = False
    item.price_updated_at = datetime.now(UTC)
    item.price_updated_by = admin.id


def upload_image(item: InventoryItem, content: bytes, content_type: str) -> str:
    """Store a new photo for the item and remove the one it replaces. Returns the object path."""
    path = storage.upload_image(IMAGE_BUCKET, str(item.id), content, content_type)
    storage.delete_object(IMAGE_BUCKET, item.image_path)
    return path
