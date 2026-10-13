"""Client accounts: creation, invitations and access changes. Admins call these through /api/admin/clients."""

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.errors import ApiError
from app.models import Profile
from app.services import email, supabase_admin

logger = logging.getLogger("elation.clients")

SET_PASSWORD_PATH = "/auth/set-password"


@dataclass
class InviteResult:
    """Outcome of sending an invitation. The link is returned so admins can share it by hand
    when the email can't be delivered (e.g. Resend's test sender, typos, spam)."""

    invite_link: str
    email_sent: bool
    email_error: str | None


def client_status(profile: Profile, now: datetime | None = None) -> str:
    """Single status shown in the admin list: revoked > expired > pending > active."""
    now = now or datetime.now(UTC)
    if profile.access_status == "revoked":
        return "revoked"
    if profile.access_expires_at and profile.access_expires_at <= now:
        return "expired"
    if profile.invitation_status == "pending":
        return "pending"
    return "active"


def find_by_email(db: Session, address: str) -> Profile | None:
    return db.scalar(select(Profile).where(func.lower(Profile.email) == address.strip().lower()))


def _issue_link(address: str) -> supabase_admin.GeneratedLink:
    """Invite link for a new auth user; for an existing one (re-send), a set-password link instead."""
    try:
        return supabase_admin.generate_link("invite", address, SET_PASSWORD_PATH)
    except supabase_admin.SupabaseAdminError as exc:
        if exc.code != "email_exists":
            raise
        return supabase_admin.generate_link("recovery", address, SET_PASSWORD_PATH)


def _send_invitation(profile: Profile, link: str) -> InviteResult:
    expires = profile.access_expires_at.strftime("%d %B %Y") if profile.access_expires_at else None
    subject, html_body = email.invitation_email(profile.full_name, link, expires)
    try:
        email.send_email(profile.email, subject, html_body)
        return InviteResult(link, True, None)
    except (email.EmailNotConfigured, email.EmailSendFailed) as exc:
        return InviteResult(link, False, str(exc))
    except Exception:
        logger.exception("Invitation email failed")
        return InviteResult(link, False, "The email service could not be reached.")


def create_client(
    db: Session,
    admin: Profile,
    *,
    full_name: str,
    address: str,
    phone: str | None,
    city: str | None,
    access_days: int | None,
) -> tuple[Profile, InviteResult]:
    address = address.strip().lower()
    if find_by_email(db, address):
        raise ApiError(409, "EMAIL_IN_USE", "An account with this email already exists.")

    try:
        link = _issue_link(address)
    except supabase_admin.SupabaseAdminError as exc:
        raise ApiError(502, "AUTH_PROVIDER_ERROR", f"Supabase refused to create the account: {exc}") from exc

    now = datetime.now(UTC)
    days = access_days or get_settings().client_access_default_days
    profile = Profile(
        id=UUID(link.user_id),
        role="client",
        full_name=full_name.strip(),
        email=address,
        phone=phone,
        city=city,
        access_expires_at=now + timedelta(days=days),
        access_status="active",
        invitation_status="pending",
        invited_at=now,
        invited_by=admin.id,
        assigned_admin_id=admin.id,  # the inviting admin becomes the consultant by default
        notification_prefs={},
        created_at=now,
    )
    db.add(profile)
    db.commit()
    return profile, _send_invitation(profile, link.action_link)


def resend_invitation(db: Session, profile: Profile) -> InviteResult:
    try:
        link = _issue_link(profile.email)
    except supabase_admin.SupabaseAdminError as exc:
        raise ApiError(502, "AUTH_PROVIDER_ERROR", f"Supabase refused to issue a link: {exc}") from exc
    profile.invited_at = datetime.now(UTC)
    db.commit()
    return _send_invitation(profile, link.action_link)


def set_access_status(db: Session, profile: Profile, status: str) -> None:
    """Revoke or reactivate. The Supabase ban is applied first so DB and auth never disagree silently."""
    if status == profile.access_status:
        return
    try:
        supabase_admin.set_banned(str(profile.id), banned=status == "revoked")
    except supabase_admin.SupabaseAdminError as exc:
        raise ApiError(502, "AUTH_PROVIDER_ERROR", f"Could not update sign-in access: {exc}") from exc
    profile.access_status = status
