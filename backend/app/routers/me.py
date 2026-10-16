from datetime import UTC, datetime

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.deps import CurrentClient, CurrentUser, DbSession
from app.models import Profile
from app.schemas.me import ConsentIn, MeResponse, MeUpdate, NotificationPrefsUpdate
from app.services import account

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


@router.put("/consent", response_model=MeResponse)
def record_consent(payload: ConsentIn, user: CurrentClient, db: DbSession) -> MeResponse:
    account.record_consent(
        db, user, version=payload.version, terms=payload.terms, data_use=payload.data_use,
        studio_share=payload.studio_share, marketing=payload.marketing,
    )
    return _respond(db, user)


@router.patch("/notifications", response_model=MeResponse)
def update_notifications(payload: NotificationPrefsUpdate, user: CurrentClient, db: DbSession) -> MeResponse:
    account.update_notification_prefs(
        db, user, consultant_messages=payload.consultant_messages, marketing=payload.marketing
    )
    return _respond(db, user)


@router.get("/export")
def export_my_data(user: CurrentClient, db: DbSession) -> JSONResponse:
    """Everything the client has saved, as a downloadable JSON file."""
    filename = f"elation-export-{datetime.now(UTC).date().isoformat()}.json"
    return JSONResponse(
        account.export_data(db, user), headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )
