from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.deps import CurrentAdmin, DbSession
from app.errors import ApiError
from app.models import Event, Profile
from app.schemas.clients import AdminSummary, ClientCreate, ClientRow, ClientUpdate, InviteResponse
from app.services import clients as client_service

router = APIRouter(prefix="/admin", tags=["admin: clients"])


def _get_client(db: Session, client_id: UUID) -> Profile:
    profile = db.get(Profile, client_id)
    if profile is None or profile.role != "client":
        raise ApiError(404, "NOT_FOUND", "Client not found.")
    return profile


def _row(db: Session, profile: Profile) -> ClientRow:
    consultant = db.get(Profile, profile.assigned_admin_id) if profile.assigned_admin_id else None
    event_count = db.scalar(select(func.count()).select_from(Event).where(Event.client_id == profile.id)) or 0
    return ClientRow.build(profile, consultant, event_count)


def _blank_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    return value.strip() or None


@router.get("/admins", response_model=list[AdminSummary])
def list_admins(_: CurrentAdmin, db: DbSession) -> list[AdminSummary]:
    """Admins who can be assigned as a client's consultant."""
    admins = db.scalars(
        select(Profile).where(Profile.role == "admin", Profile.access_status == "active").order_by(Profile.full_name)
    )
    return [AdminSummary.from_profile(a) for a in admins]


@router.get("/clients", response_model=list[ClientRow])
def list_clients(
    _: CurrentAdmin,
    db: DbSession,
    search: str | None = Query(default=None, max_length=100),
    status: Literal["pending", "active", "expired", "revoked"] | None = None,
) -> list[ClientRow]:
    query = select(Profile).where(Profile.role == "client").order_by(Profile.created_at.desc())
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        query = query.where(or_(Profile.full_name.ilike(pattern), Profile.email.ilike(pattern)))
    profiles = list(db.scalars(query))
    if not profiles:
        return []

    consultants = {p.id: p for p in db.scalars(select(Profile).where(Profile.role == "admin"))}
    count_rows = db.execute(
        select(Event.client_id, func.count())
        .where(Event.client_id.in_([p.id for p in profiles]))
        .group_by(Event.client_id)
    )
    event_counts = {client_id: count for client_id, count in count_rows}

    rows = [ClientRow.build(p, consultants.get(p.assigned_admin_id), event_counts.get(p.id, 0)) for p in profiles]
    return [r for r in rows if r.status == status] if status else rows


@router.post("/clients", response_model=InviteResponse, status_code=201)
def create_client(payload: ClientCreate, admin: CurrentAdmin, db: DbSession) -> InviteResponse:
    profile, result = client_service.create_client(
        db,
        admin,
        full_name=payload.name,
        address=payload.email,
        phone=_blank_to_none(payload.phone),
        city=_blank_to_none(payload.city),
        access_days=payload.access_days,
    )
    return InviteResponse.build(_row(db, profile), result)


@router.get("/clients/{client_id}", response_model=ClientRow)
def get_client(client_id: UUID, _: CurrentAdmin, db: DbSession) -> ClientRow:
    return _row(db, _get_client(db, client_id))


@router.patch("/clients/{client_id}", response_model=ClientRow)
def update_client(client_id: UUID, payload: ClientUpdate, _: CurrentAdmin, db: DbSession) -> ClientRow:
    profile = _get_client(db, client_id)
    sent = payload.model_fields_set

    if "name" in sent and payload.name:
        profile.full_name = payload.name.strip()
    if "phone" in sent:
        profile.phone = _blank_to_none(payload.phone)
    if "city" in sent:
        profile.city = _blank_to_none(payload.city)
    if "access_expires_at" in sent:
        if payload.access_expires_at is None or payload.access_expires_at.tzinfo is None:
            raise ApiError(400, "VALIDATION_FAILED", "accessExpiresAt must be a date-time with a timezone.")
        profile.access_expires_at = payload.access_expires_at
    if "consultant_id" in sent:
        consultant = db.get(Profile, payload.consultant_id) if payload.consultant_id else None
        if payload.consultant_id and (consultant is None or consultant.role != "admin"):
            raise ApiError(400, "VALIDATION_FAILED", "Consultant must be an admin.")
        profile.assigned_admin_id = payload.consultant_id
    if "access_status" in sent and payload.access_status:
        client_service.set_access_status(db, profile, payload.access_status)

    db.commit()
    return _row(db, profile)


@router.post("/clients/{client_id}/invite", response_model=InviteResponse)
def resend_invite(client_id: UUID, _: CurrentAdmin, db: DbSession) -> InviteResponse:
    profile = _get_client(db, client_id)
    if client_service.client_status(profile) in ("revoked", "expired"):
        raise ApiError(409, "ACCESS_ENDED", "Reactivate or extend this client's access before re-sending.")
    result = client_service.resend_invitation(db, profile)
    return InviteResponse.build(_row(db, profile), result)
