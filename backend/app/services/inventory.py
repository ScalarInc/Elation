"""Inventory: admin edits, price history and image storage. Budgets always read the live `price_pkr`."""

import re
import secrets
from datetime import UTC, datetime

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.errors import ApiError
from app.models import InventoryItem, InventoryPriceHistory, Profile

IMAGE_BUCKET = "inventory-images"
ALLOWED_IMAGE_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024


def image_url(path: str | None) -> str | None:
    if not path:
        return None
    return f"{get_settings().supabase_url.rstrip('/')}/storage/v1/object/public/{IMAGE_BUCKET}/{path}"


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


def _storage(method: str, path: str, **kwargs) -> httpx.Response:
    settings = get_settings()
    return httpx.request(
        method,
        f"{settings.supabase_url.rstrip('/')}/storage/v1{path}",
        headers={"apikey": settings.supabase_secret_key, "Authorization": f"Bearer {settings.supabase_secret_key}",
                 **kwargs.pop("headers", {})},
        timeout=30,
        **kwargs,
    )


def _ensure_bucket() -> None:
    response = _storage("POST", "/bucket", json={"id": IMAGE_BUCKET, "name": IMAGE_BUCKET, "public": True})
    if response.status_code >= 400 and "already exists" not in response.text.lower():
        raise ApiError(502, "STORAGE_ERROR", f"Could not prepare image storage: {response.text[:200]}")


def upload_image(item: InventoryItem, content: bytes, content_type: str) -> str:
    """Store the image in Supabase Storage and return its object path."""
    extension = ALLOWED_IMAGE_TYPES.get(content_type)
    if extension is None:
        raise ApiError(400, "VALIDATION_FAILED", "Upload a JPEG, PNG or WebP image.")
    if len(content) > MAX_IMAGE_BYTES:
        raise ApiError(400, "VALIDATION_FAILED", "Images must be 5 MB or smaller.")

    path = f"{item.id}/{secrets.token_hex(6)}.{extension}"

    def put() -> httpx.Response:
        return _storage("POST", f"/object/{IMAGE_BUCKET}/{path}", content=content, headers={"Content-Type": content_type})

    response = put()
    if response.status_code == 404 or "bucket not found" in response.text.lower():
        _ensure_bucket()  # first upload on a fresh project
        response = put()
    if response.status_code >= 400:
        raise ApiError(502, "STORAGE_ERROR", f"Image upload failed: {response.text[:200]}")

    if item.image_path:  # best effort: remove the replaced image
        _storage("DELETE", f"/object/{IMAGE_BUCKET}/{item.image_path}")
    return path
