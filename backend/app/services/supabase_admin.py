"""Calls to the Supabase Auth admin API (server-side, uses the secret key)."""

from dataclasses import dataclass
from typing import Literal

import httpx

from app.config import get_settings

LinkType = Literal["invite", "recovery"]


class SupabaseAdminError(Exception):
    def __init__(self, status_code: int, code: str | None, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.code = code


@dataclass
class GeneratedLink:
    user_id: str
    action_link: str


def _admin_request(method: str, path: str, json: dict | None = None) -> dict:
    settings = get_settings()
    response = httpx.request(
        method,
        f"{settings.supabase_url.rstrip('/')}/auth/v1/admin{path}",
        headers={"apikey": settings.supabase_secret_key},
        json=json,
        timeout=15,
    )
    if response.status_code >= 400:
        body = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
        raise SupabaseAdminError(
            response.status_code,
            body.get("error_code") or body.get("code"),
            body.get("msg") or body.get("message") or response.text,
        )
    return response.json()


def generate_link(link_type: LinkType, email: str, redirect_path: str) -> GeneratedLink:
    """Create a one-time action link without Supabase sending any email (we send it via Resend).

    `invite` also creates the auth user; it fails with `email_exists` if the user already exists.
    """
    redirect_to = get_settings().frontend_url.rstrip("/") + redirect_path
    data = _admin_request("POST", "/generate_link", {"type": link_type, "email": email, "redirect_to": redirect_to})
    return GeneratedLink(user_id=data["id"], action_link=data["action_link"])
