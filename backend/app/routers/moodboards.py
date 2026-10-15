import time
from collections import defaultdict, deque
from uuid import UUID

from fastapi import APIRouter, Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.deps import CurrentClient, DbSession
from app.errors import ApiError
from app.models import BudgetLine, Event, InventoryItem, Moodboard, MoodboardItem, Profile
from app.schemas.budget import BudgetOut
from app.schemas.moodboards import BudgetFromMoodboardRequest, GenerateRequest, MoodboardOut, MoodboardUpdate
from app.services import budget as budget_service
from app.services.events import get_own_event
from app.services.recommendations import service as recommendations

router = APIRouter(tags=["moodboards"])

GENERATIONS_PER_HOUR = 10
_recent_generations: dict[UUID, deque[float]] = defaultdict(deque)


def _rate_limit(user_id: UUID) -> None:
    now = time.monotonic()
    hits = _recent_generations[user_id]
    while hits and now - hits[0] > 3600:
        hits.popleft()
    if len(hits) >= GENERATIONS_PER_HOUR:
        raise ApiError(429, "RATE_LIMITED", "You've generated a lot of concepts this hour. Please try again later.")
    hits.append(now)


def _out(db: Session, board: Moodboard, event_type: str) -> MoodboardOut:
    rows = db.execute(
        select(MoodboardItem, InventoryItem)
        .join(InventoryItem, InventoryItem.id == MoodboardItem.inventory_item_id)
        .where(MoodboardItem.moodboard_id == board.id)
        .order_by(MoodboardItem.position)
    )
    return MoodboardOut.build(board, event_type, list(rows))


def _own_moodboard(db: Session, user: Profile, moodboard_id: UUID) -> tuple[Moodboard, Event]:
    board = db.get(Moodboard, moodboard_id)
    event = db.get(Event, board.event_id) if board else None
    if board is None or event is None or event.client_id != user.id:
        raise ApiError(404, "NOT_FOUND", "Moodboard not found.")
    return board, event


@router.get("/moodboards", response_model=list[MoodboardOut])
def list_moodboards(user: CurrentClient, db: DbSession) -> list[MoodboardOut]:
    rows = db.execute(
        select(Moodboard, Event.type).join(Event, Event.id == Moodboard.event_id)
        .where(Event.client_id == user.id).order_by(Moodboard.created_at.desc())
    )
    return [_out(db, board, event_type) for board, event_type in rows]


@router.get("/events/{event_id}/moodboards", response_model=list[MoodboardOut])
def event_moodboards(event_id: UUID, user: CurrentClient, db: DbSession) -> list[MoodboardOut]:
    event = get_own_event(db, user.id, event_id)
    boards = db.scalars(select(Moodboard).where(Moodboard.event_id == event.id).order_by(Moodboard.created_at.desc()))
    return [_out(db, b, event.type) for b in boards]


@router.post("/events/{event_id}/moodboards/generate", response_model=MoodboardOut, status_code=201)
def generate(event_id: UUID, payload: GenerateRequest, user: CurrentClient, db: DbSession) -> MoodboardOut:
    event = get_own_event(db, user.id, event_id)
    _rate_limit(user.id)
    board = recommendations.generate_moodboard(db, event, payload.model_dump())
    return _out(db, board, event.type)


@router.patch("/moodboards/{moodboard_id}", response_model=MoodboardOut)
def update_moodboard(moodboard_id: UUID, payload: MoodboardUpdate, user: CurrentClient, db: DbSession) -> MoodboardOut:
    board, event = _own_moodboard(db, user, moodboard_id)
    if payload.title is not None:
        board.title = payload.title.strip()
    if payload.liked is not None:
        board.liked = payload.liked
    db.commit()
    return _out(db, board, event.type)


@router.post("/moodboards/{moodboard_id}/duplicate", response_model=MoodboardOut, status_code=201)
def duplicate_moodboard(moodboard_id: UUID, user: CurrentClient, db: DbSession) -> MoodboardOut:
    board, event = _own_moodboard(db, user, moodboard_id)
    copy = Moodboard(
        event_id=board.event_id, title=f"{board.title} (copy)"[:80], summary=board.summary, palette=board.palette,
        mood=board.mood, style=board.style, density=board.density, venue=board.venue, source=board.source,
        inspiration_id=board.inspiration_id,
    )
    db.add(copy)
    db.flush()
    for mi in db.scalars(select(MoodboardItem).where(MoodboardItem.moodboard_id == board.id)):
        db.add(MoodboardItem(moodboard_id=copy.id, inventory_item_id=mi.inventory_item_id, position=mi.position,
                             suggested_qty=mi.suggested_qty, budget_category=mi.budget_category, reason=mi.reason))
    db.commit()
    db.refresh(copy)
    return _out(db, copy, event.type)


@router.delete("/moodboards/{moodboard_id}", status_code=204)
def delete_moodboard(moodboard_id: UUID, user: CurrentClient, db: DbSession) -> Response:
    board, _ = _own_moodboard(db, user, moodboard_id)
    db.delete(board)
    db.commit()
    return Response(status_code=204)


@router.post("/events/{event_id}/budget/generate", response_model=BudgetOut)
def budget_from_moodboard(event_id: UUID, payload: BudgetFromMoodboardRequest, user: CurrentClient, db: DbSession) -> BudgetOut:
    """Starter budget: turn a moodboard's items and suggested quantities into budget lines."""
    event = get_own_event(db, user.id, event_id)
    has_lines = db.scalar(select(BudgetLine.id).where(BudgetLine.event_id == event.id).limit(1)) is not None
    if has_lines and not payload.replace:
        raise ApiError(409, "BUDGET_NOT_EMPTY", "This budget already has items. Confirm to replace them.")

    if payload.moodboard_id:
        board, board_event = _own_moodboard(db, user, payload.moodboard_id)
        if board_event.id != event.id:
            raise ApiError(400, "VALIDATION_FAILED", "That moodboard belongs to a different event.")
    else:
        board = db.scalar(select(Moodboard).where(Moodboard.event_id == event.id).order_by(Moodboard.created_at.desc()))
        if board is None:
            _rate_limit(user.id)
            board = recommendations.generate_moodboard(db, event, {})

    rows = db.execute(
        select(MoodboardItem, InventoryItem).join(InventoryItem, InventoryItem.id == MoodboardItem.inventory_item_id)
        .where(MoodboardItem.moodboard_id == board.id, InventoryItem.is_active.is_(True))
        .order_by(MoodboardItem.position)
    )
    db.execute(delete(BudgetLine).where(BudgetLine.event_id == event.id))
    for position, (mi, _item) in enumerate(rows):
        db.add(BudgetLine(event_id=event.id, inventory_item_id=mi.inventory_item_id, category=mi.budget_category or "Other",
                          quantity=mi.suggested_qty or 1, included=True, source="recommended", position=position))
    db.commit()

    priced = budget_service.load_priced_lines(db, event.id)
    return BudgetOut.build(event.id, event.target_budget_pkr, priced, budget_service.compute_totals(priced, event.target_budget_pkr))
