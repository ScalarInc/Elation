from datetime import UTC, datetime

from fastapi import APIRouter

from app.deps import CurrentUser, DbSession
from app.models import Profile
from app.schemas.me import MeResponse, MeUpdate

router = APIRouter(prefix="/me", tags=["me"])


def _respond(db: DbSession, user: Profile) -> MeResponse:
    consultant = db.get(Profile, user.assigned_admin_id) if user.assigned_admin_id else None
    return MeResponse.from_profile(user, consultant)


@router.get("", response_model=MeResponse)
def get_me(user: CurrentUser, db: DbSession) -> MeResponse:
    # A successful authenticated call means the invitation was accepted.
    if user.invitation_status == "pending":
        user.invitation_status = "accepted"
        user.activated_at = datetime.now(UTC)
        db.commit()
    return _respond(db, user)


@router.patch("", response_model=MeResponse)
def update_me(payload: MeUpdate, user: CurrentUser, db: DbSession) -> MeResponse:
    user.full_name = payload.name.strip()
    for field in ("phone", "city", "client_role", "partner_name", "emergency_contact_name", "emergency_contact_phone"):
        value = getattr(payload, field)
        if isinstance(value, str):
            value = value.strip() or None  # store blanks as NULL
        setattr(user, field, value)
    db.commit()
    return _respond(db, user)
