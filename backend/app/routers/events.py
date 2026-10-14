from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select

from app.deps import CurrentClient, DbSession
from app.models import Event, QuestionnaireResponse
from app.schemas.events import EventCreate, EventOut, EventUpdate, QuestionnaireIn, QuestionnaireOut
from app.services import events as event_service

router = APIRouter(prefix="/events", tags=["events"])


def _out(db: DbSession, event: Event) -> EventOut:
    return EventOut.build(event, event_service.module_progress(db, event), event_service.event_status(event))


@router.get("", response_model=list[EventOut])
def list_events(user: CurrentClient, db: DbSession) -> list[EventOut]:
    events = db.scalars(select(Event).where(Event.client_id == user.id).order_by(Event.event_date))
    return [_out(db, e) for e in events]


@router.post("", response_model=EventOut, status_code=201)
def create_event(payload: EventCreate, user: CurrentClient, db: DbSession) -> EventOut:
    name = payload.name.strip()
    event = Event(
        client_id=user.id, name=name, concept=name, type=payload.type,
        event_date=event_service.to_event_datetime(payload.date),
        venue_name=payload.venue_name.strip(), venue_city=payload.city.strip(), venue_setting=payload.venue_setting,
        guest_count=payload.guests, target_budget_pkr=payload.budget_pkr, status="draft", questionnaire_percent=0,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return _out(db, event)


@router.get("/{event_id}", response_model=EventOut)
def get_event(event_id: UUID, user: CurrentClient, db: DbSession) -> EventOut:
    return _out(db, event_service.get_own_event(db, user.id, event_id))


@router.patch("/{event_id}", response_model=EventOut)
def update_event(event_id: UUID, payload: EventUpdate, user: CurrentClient, db: DbSession) -> EventOut:
    event = event_service.get_own_event(db, user.id, event_id)
    sent = payload.model_fields_set
    if "name" in sent and payload.name:
        event.name = payload.name.strip()
    if "type" in sent and payload.type:
        event.type = payload.type
    if "date" in sent and payload.date:
        event.event_date = event_service.to_event_datetime(payload.date)
    if "venue_name" in sent and payload.venue_name:
        event.venue_name = payload.venue_name.strip()
    if "city" in sent and payload.city:
        event.venue_city = payload.city.strip()
    if "guests" in sent and payload.guests:
        event.guest_count = payload.guests
    if "venue_setting" in sent and payload.venue_setting:
        event.venue_setting = payload.venue_setting
    if "budget_pkr" in sent:
        event.target_budget_pkr = payload.budget_pkr
    db.commit()
    return _out(db, event)


@router.get("/{event_id}/questionnaire", response_model=QuestionnaireOut)
def get_questionnaire(event_id: UUID, user: CurrentClient, db: DbSession) -> QuestionnaireOut:
    event = event_service.get_own_event(db, user.id, event_id)
    saved = db.get(QuestionnaireResponse, event.id)
    return QuestionnaireOut(
        answers=saved.answers if saved else {},
        elation_decides=saved.elation_decides if saved else {},
        percent=event.questionnaire_percent,
        updated_at=saved.updated_at if saved else None,
    )


@router.put("/{event_id}/questionnaire", response_model=QuestionnaireOut)
def save_questionnaire(event_id: UUID, payload: QuestionnaireIn, user: CurrentClient, db: DbSession) -> QuestionnaireOut:
    event = event_service.get_own_event(db, user.id, event_id)
    saved = event_service.save_questionnaire(db, event, payload.answers, payload.elation_decides, payload.percent)
    return QuestionnaireOut(
        answers=saved.answers, elation_decides=saved.elation_decides, percent=event.questionnaire_percent,
        updated_at=saved.updated_at,
    )
