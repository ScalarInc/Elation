from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select

from app.deps import CurrentClient, DbSession
from app.models import Event, QuoteRequest
from app.schemas.budget import BudgetIn, BudgetOut, QuoteOut, QuoteRequestIn
from app.services import budget as budget_service
from app.services.events import get_own_event

router = APIRouter(tags=["budget"])


def _budget(db: DbSession, event: Event) -> BudgetOut:
    priced = budget_service.load_priced_lines(db, event.id)
    totals = budget_service.compute_totals(priced, event.target_budget_pkr)
    return BudgetOut.build(event.id, event.target_budget_pkr, priced, totals)


@router.get("/events/{event_id}/budget", response_model=BudgetOut)
def get_budget(event_id: UUID, user: CurrentClient, db: DbSession) -> BudgetOut:
    return _budget(db, get_own_event(db, user.id, event_id))


@router.put("/events/{event_id}/budget", response_model=BudgetOut)
def save_budget(event_id: UUID, payload: BudgetIn, user: CurrentClient, db: DbSession) -> BudgetOut:
    event = get_own_event(db, user.id, event_id)
    budget_service.replace_lines(db, event, payload.target_budget_pkr, [line.model_dump() for line in payload.lines])
    return _budget(db, event)


@router.post("/events/{event_id}/quote-requests", response_model=QuoteOut, status_code=201)
def request_quote(event_id: UUID, payload: QuoteRequestIn, user: CurrentClient, db: DbSession) -> QuoteOut:
    event = get_own_event(db, user.id, event_id)
    return QuoteOut.from_model(budget_service.create_quote_request(db, event, user, payload.note))


@router.get("/quote-requests", response_model=list[QuoteOut])
def list_quotes(user: CurrentClient, db: DbSession) -> list[QuoteOut]:
    quotes = db.scalars(select(QuoteRequest).where(QuoteRequest.client_id == user.id).order_by(QuoteRequest.created_at.desc()))
    return [QuoteOut.from_model(q) for q in quotes]
