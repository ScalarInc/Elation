"""Supabase Storage helpers (public-read buckets, server-side writes with the secret key)."""

import secrets

import httpx

from app.config import get_settings
from app.errors import ApiError

ALLOWED_IMAGE_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024


def public_url(bucket: str, path: str | None) -> str | None:
    if not path:
        return None
    return f"{get_settings().supabase_url.rstrip('/')}/storage/v1/object/public/{bucket}/{path}"


def _request(method: str, path: str, **kwargs) -> httpx.Response:
    settings = get_settings()
    headers = {"apikey": settings.supabase_secret_key, "Authorization": f"Bearer {settings.supabase_secret_key}"}
    headers.update(kwargs.pop("headers", {}))
    return httpx.request(method, f"{settings.supabase_url.rstrip('/')}/storage/v1{path}", headers=headers, timeout=30, **kwargs)


def _ensure_bucket(bucket: str) -> None:
    response = _request("POST", "/bucket", json={"id": bucket, "name": bucket, "public": True})
    if response.status_code >= 400 and "already exists" not in response.text.lower():
        raise ApiError(502, "STORAGE_ERROR", f"Could not prepare image storage: {response.text[:200]}")


def upload_image(bucket: str, folder: str, content: bytes, content_type: str) -> str:
    """Validate and store an image; returns its object path. Creates the bucket on first use."""
    extension = ALLOWED_IMAGE_TYPES.get(content_type)
    if extension is None:
        raise ApiError(400, "VALIDATION_FAILED", "Upload a JPEG, PNG or WebP image.")
    if len(content) > MAX_IMAGE_BYTES:
        raise ApiError(400, "VALIDATION_FAILED", "Images must be 5 MB or smaller.")

    path = f"{folder}/{secrets.token_hex(6)}.{extension}"

    def put() -> httpx.Response:
        return _request("POST", f"/object/{bucket}/{path}", content=content, headers={"Content-Type": content_type})

    response = put()
    if response.status_code == 404 or "bucket not found" in response.text.lower():
        _ensure_bucket(bucket)
        response = put()
    if response.status_code >= 400:
        raise ApiError(502, "STORAGE_ERROR", f"Image upload failed: {response.text[:200]}")
    return path


def delete_object(bucket: str, path: str | None) -> None:
    """Best effort; a leftover file is harmless."""
    if path:
        _request("DELETE", f"/object/{bucket}/{path}")
