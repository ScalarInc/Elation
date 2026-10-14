"""Request dependencies: authenticate the caller and enforce role and access rules.

Usage in routers:
    def handler(user: CurrentUser): ...        # any signed-in user with active access
    def handler(admin: CurrentAdmin): ...      # admins only
"""

from datetime import UTC, datetime
from functools import lru_cache
from typing import Annotated
from uuid import UUID

import jwt
from fastapi import Depends, Header
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.errors import ApiError
from app.models import Profile

DbSession = Annotated[Session, Depends(get_db)]


@lru_cache
def _jwks_client() -> jwt.PyJWKClient:
    # Supabase signs access tokens with asymmetric keys published at this URL; keys are cached.
    return jwt.PyJWKClient(f"{get_settings().supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json")


def verify_access_token(token: str) -> UUID:
    """Return the Supabase user id from a valid access token, or raise 401."""
    settings = get_settings()
    try:
        signing_key = _jwks_client().get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "RS256"],
            audience="authenticated",
            issuer=f"{settings.supabase_url.rstrip('/')}/auth/v1",
            leeway=60,  # tolerate small clock differences between this machine and Supabase
        )
        return UUID(claims["sub"])
    except (jwt.PyJWTError, KeyError, ValueError) as exc:
        raise ApiError(401, "INVALID_TOKEN", "Your session has expired. Please sign in again.") from exc


def ensure_active_access(profile: Profile) -> None:
    if profile.access_status != "active":
        raise ApiError(403, "ACCESS_REVOKED", "Your access has been revoked. Please contact Elation.")
    if profile.role == "client" and profile.access_expires_at and profile.access_expires_at <= datetime.now(UTC):
        raise ApiError(403, "ACCESS_EXPIRED", "Your access period has ended. Please contact Elation.")


def get_current_user(db: DbSession, authorization: Annotated[str | None, Header()] = None) -> Profile:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise ApiError(401, "UNAUTHENTICATED", "Please sign in.")
    user_id = verify_access_token(authorization.split(" ", 1)[1].strip())
    profile = db.get(Profile, user_id)
    if profile is None:
        raise ApiError(403, "NO_PROFILE", "This account has not been set up by Elation.")
    ensure_active_access(profile)
    return profile


def require_admin(user: Annotated[Profile, Depends(get_current_user)]) -> Profile:
    if user.role != "admin":
        raise ApiError(403, "FORBIDDEN", "Admins only.")
    return user


def require_client(user: Annotated[Profile, Depends(get_current_user)]) -> Profile:
    if user.role != "client":
        raise ApiError(403, "FORBIDDEN", "This area is for clients.")
    return user


CurrentUser = Annotated[Profile, Depends(get_current_user)]
CurrentAdmin = Annotated[Profile, Depends(require_admin)]
CurrentClient = Annotated[Profile, Depends(require_client)]
