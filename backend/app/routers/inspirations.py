from uuid import UUID

from fastapi import APIRouter, Form, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import CurrentAdmin, CurrentClient, CurrentUser, DbSession
from app.errors import ApiError
from app.models import Inspiration
from app.schemas.inspirations import (
    AdminInspirationOut,
    AdoptRequest,
    AdoptResponse,
    InspirationCreate,
    InspirationItemIn,
    InspirationOut,
    InspirationUpdate,
    RecommendedConcept,
)
from app.services import inspirations as service
from app.services import storage
from app.services.events import get_own_event

client_router = APIRouter(tags=["inspirations"])
admin_router = APIRouter(prefix="/admin/inspirations", tags=["admin: inspirations"])

_ORDER = (Inspiration.is_featured.desc(), Inspiration.name)


def _published(db: Session, slug: str) -> Inspiration:
    insp = db.scalar(select(Inspiration).where(Inspiration.slug == slug, Inspiration.is_published.is_(True)))
    if insp is None:
        raise ApiError(404, "NOT_FOUND", "Concept not found.")
    return insp


def _admin_out(db: Session, insp: Inspiration) -> AdminInspirationOut:
    rows = service.items_for(db, [insp.id])[insp.id]
    base = InspirationOut.build(insp, rows, include_archived=True)
    return AdminInspirationOut(**base.model_dump(), is_published=insp.is_published, image_paths=insp.image_paths,
                               updated_at=insp.updated_at)


def _get(db: Session, inspiration_id: UUID) -> Inspiration:
    insp = db.get(Inspiration, inspiration_id)
    if insp is None:
        raise ApiError(404, "NOT_FOUND", "Concept not found.")
    return insp


# ---------- clients ----------


@client_router.get("/inspirations", response_model=list[InspirationOut])
def list_inspirations(_: CurrentUser, db: DbSession) -> list[InspirationOut]:
    found = list(db.scalars(select(Inspiration).where(Inspiration.is_published.is_(True)).order_by(*_ORDER)))
    rows = service.items_for(db, [i.id for i in found])
    return [InspirationOut.build(i, rows[i.id]) for i in found]


@client_router.get("/inspirations/{slug}", response_model=InspirationOut)
def get_inspiration(slug: str, _: CurrentUser, db: DbSession) -> InspirationOut:
    insp = _published(db, slug)
    return InspirationOut.build(insp, service.items_for(db, [insp.id])[insp.id])


@client_router.post("/inspirations/{slug}/adopt", response_model=AdoptResponse, status_code=201)
def adopt(slug: str, payload: AdoptRequest, user: CurrentClient, db: DbSession) -> AdoptResponse:
    insp = _published(db, slug)
    event = get_own_event(db, user.id, payload.event_id)
    board, drafted = service.adopt(db, insp, event)
    return AdoptResponse(moodboard_id=board.id, event_id=event.id, budget_drafted=drafted)


@client_router.get("/events/{event_id}/inspiration-recommendations", response_model=list[RecommendedConcept])
def recommendations(event_id: UUID, user: CurrentClient, db: DbSession) -> list[RecommendedConcept]:
    event = get_own_event(db, user.id, event_id)
    ranked = service.recommend(db, event)
    rows = service.items_for(db, [r.inspiration.id for r in ranked])
    return [
        RecommendedConcept(inspiration=InspirationOut.build(r.inspiration, rows[r.inspiration.id]), reason=r.reason,
                           estimated_cost_pkr=r.estimated_cost_pkr)
        for r in ranked
    ]


# ---------- admins ----------


@admin_router.get("", response_model=list[AdminInspirationOut])
def admin_list(_: CurrentAdmin, db: DbSession) -> list[AdminInspirationOut]:
    return [_admin_out(db, i) for i in db.scalars(select(Inspiration).order_by(*_ORDER))]


@admin_router.post("", response_model=AdminInspirationOut, status_code=201)
def admin_create(payload: InspirationCreate, _: CurrentAdmin, db: DbSession) -> AdminInspirationOut:
    insp = Inspiration(slug=service.make_slug(db, payload.name), name=payload.name.strip(),
                       **payload.model_dump(exclude={"name"}))
    db.add(insp)
    db.commit()
    db.refresh(insp)
    return _admin_out(db, insp)


@admin_router.patch("/{inspiration_id}", response_model=AdminInspirationOut)
def admin_update(inspiration_id: UUID, payload: InspirationUpdate, _: CurrentAdmin, db: DbSession) -> AdminInspirationOut:
    insp = _get(db, inspiration_id)
    for field in payload.model_fields_set:
        value = getattr(payload, field)
        if value is None and field in ("name", "style_tags", "event_types", "palette", "is_featured", "is_published"):
            continue  # these can't be cleared to null
        setattr(insp, field, value.strip() if isinstance(value, str) else value)
    db.commit()
    db.refresh(insp)
    return _admin_out(db, insp)


@admin_router.put("/{inspiration_id}/items", response_model=AdminInspirationOut)
def admin_set_items(inspiration_id: UUID, items: list[InspirationItemIn], _: CurrentAdmin, db: DbSession) -> AdminInspirationOut:
    insp = _get(db, inspiration_id)
    if len({i.inventory_item_id for i in items}) != len(items):
        raise ApiError(400, "VALIDATION_FAILED", "Each inventory item can only be listed once.")
    service.set_items(db, insp, [i.model_dump() for i in items])
    db.commit()
    return _admin_out(db, insp)


@admin_router.post("/{inspiration_id}/images", response_model=AdminInspirationOut)
async def admin_add_image(
    inspiration_id: UUID, file: UploadFile, _: CurrentAdmin, db: DbSession, cover: bool = Form(default=False)
) -> AdminInspirationOut:
    insp = _get(db, inspiration_id)
    content = await file.read(storage.MAX_IMAGE_BYTES + 1)
    service.add_image(insp, content, file.content_type or "", as_cover=cover)
    db.commit()
    db.refresh(insp)
    return _admin_out(db, insp)


@admin_router.delete("/{inspiration_id}/images", response_model=AdminInspirationOut)
def admin_remove_image(inspiration_id: UUID, path: str, _: CurrentAdmin, db: DbSession) -> AdminInspirationOut:
    insp = _get(db, inspiration_id)
    service.remove_image(insp, path)
    db.commit()
    db.refresh(insp)
    return _admin_out(db, insp)
