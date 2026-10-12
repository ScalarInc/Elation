import logging
import time
from collections import defaultdict, deque

from fastapi import APIRouter, Request, Response
from sqlalchemy import func, select

from app.deps import DbSession, ensure_active_access
from app.errors import ApiError
from app.models import Profile
from app.schemas.me import ForgotPasswordRequest
from app.services import email, supabase_admin

logger = logging.getLogger("elation.auth")
router = APIRouter(prefix="/auth", tags=["auth"])

_WINDOW_SECONDS = 15 * 60
_MAX_REQUESTS = 5
_recent_requests: dict[str, deque[float]] = defaultdict(deque)


def _rate_limit(key: str) -> None:
    """Small in-memory limiter; enough for a single-process MVP."""
    now = time.monotonic()
    hits = _recent_requests[key]
    while hits and now - hits[0] > _WINDOW_SECONDS:
        hits.popleft()
    if len(hits) >= _MAX_REQUESTS:
        raise ApiError(429, "RATE_LIMITED", "Too many requests. Please try again in a few minutes.")
    hits.append(now)


@router.post("/forgot-password", status_code=202)
def forgot_password(payload: ForgotPasswordRequest, request: Request, db: DbSession) -> Response:
    """Email a reset link. Always answers 202 so it can't be used to discover which emails exist."""
    _rate_limit(request.client.host if request.client else "unknown")
    address = payload.email.strip().lower()
    profile = db.scalar(select(Profile).where(func.lower(Profile.email) == address))
    try:
        if profile is None:
            return Response(status_code=202)
        ensure_active_access(profile)
        link = supabase_admin.generate_link("recovery", profile.email, "/auth/reset-password")
        subject, html_body = email.password_reset_email(link.action_link)
        email.send_email(profile.email, subject, html_body)
    except ApiError:
        pass  # expired or revoked: silently no email
    except Exception:
        logger.exception("Password reset email failed")
    return Response(status_code=202)
