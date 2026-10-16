"""The signed-in client's own account: consent, notification preferences and data export.

Stored on the profile as JSON with snake_case keys:
- consent:            {version, accepted_at, terms, data_use, studio_share, marketing}
- notification_prefs: {consultant_messages, marketing}
"Marketing" is one choice: the consent opt-in and the Settings toggle always stay in sync.
"""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.constants import CONSENT_VERSION
from app.errors import ApiError
from app.models import (
    BudgetLine,
    Event,
    InventoryItem,
    Message,
    Moodboard,
    MoodboardItem,
    Profile,
    QuestionnaireResponse,
    QuoteRequest,
)

# Defaults when a client has never changed a preference.
NOTIFICATION_DEFAULTS = {"consultant_messages": True, "marketing": False}


def notification_prefs(profile: Profile) -> dict[str, bool]:
    saved = profile.notification_prefs or {}
    return {key: bool(saved.get(key, default)) for key, default in NOTIFICATION_DEFAULTS.items()}


def record_consent(
    db: Session, profile: Profile, *, version: int, terms: bool, data_use: bool, studio_share: bool, marketing: bool
) -> None:
    if version != CONSENT_VERSION:
        raise ApiError(409, "CONSENT_OUTDATED", "These terms have changed. Reload the page to review them.")
    if not (terms and data_use and studio_share):
        raise ApiError(400, "VALIDATION_FAILED", "Please accept the required agreements to continue.")
    profile.consent = {
        "version": version,
        "accepted_at": datetime.now(UTC).isoformat(),
        "terms": True,
        "data_use": True,
        "studio_share": True,
        "marketing": marketing,
    }
    profile.notification_prefs = {**notification_prefs(profile), "marketing": marketing}
    db.commit()


def update_notification_prefs(
    db: Session, profile: Profile, *, consultant_messages: bool | None, marketing: bool | None
) -> None:
    prefs = notification_prefs(profile)
    if consultant_messages is not None:
        prefs["consultant_messages"] = consultant_messages
    if marketing is not None:
        prefs["marketing"] = marketing
        if profile.consent:
            profile.consent = {**profile.consent, "marketing": marketing}
    profile.notification_prefs = prefs  # reassign so SQLAlchemy notices the JSON change
    db.commit()


# ---------- data export ----------


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def export_data(db: Session, client: Profile) -> dict[str, Any]:
    """Everything the client has saved. Every query is filtered by the client's own id
    (child rows through their event), so nothing belonging to another client can appear."""
    events = list(db.scalars(select(Event).where(Event.client_id == client.id).order_by(Event.created_at)))
    owned = select(Event.id).where(Event.client_id == client.id)

    questionnaires = {
        q.event_id: q
        for q in db.scalars(select(QuestionnaireResponse).where(QuestionnaireResponse.event_id.in_(owned)))
    }
    moodboards = list(db.scalars(select(Moodboard).where(Moodboard.event_id.in_(owned)).order_by(Moodboard.created_at)))
    board_items = db.execute(
        select(MoodboardItem, InventoryItem)
        .join(InventoryItem, InventoryItem.id == MoodboardItem.inventory_item_id)
        .join(Moodboard, Moodboard.id == MoodboardItem.moodboard_id)
        .where(Moodboard.event_id.in_(owned))
        .order_by(MoodboardItem.position)
    ).all()
    budget_lines = db.execute(
        select(BudgetLine, InventoryItem)
        .join(InventoryItem, InventoryItem.id == BudgetLine.inventory_item_id)
        .where(BudgetLine.event_id.in_(owned))
        .order_by(BudgetLine.position)
    ).all()
    quotes = list(db.scalars(
        select(QuoteRequest)
        .where(QuoteRequest.client_id == client.id, QuoteRequest.event_id.in_(owned))
        .order_by(QuoteRequest.created_at)
    ))
    messages = list(db.scalars(select(Message).where(Message.client_id == client.id).order_by(Message.created_at)))

    def items_for(board: Moodboard) -> list[dict]:
        return [
            {"sku": item.sku, "name": item.name, "category": item.category, "suggestedQty": entry.suggested_qty,
             "budgetCategory": entry.budget_category, "reason": entry.reason}
            for entry, item in board_items
            if entry.moodboard_id == board.id
        ]

    def event_out(event: Event) -> dict:
        questionnaire = questionnaires.get(event.id)
        return {
            "id": str(event.id),
            "name": event.name,
            "type": event.type,
            "concept": event.concept,
            "date": event.event_date.date().isoformat(),
            "venue": {"name": event.venue_name, "city": event.venue_city, "setting": event.venue_setting},
            "guestCount": event.guest_count,
            "targetBudgetPkr": event.target_budget_pkr,
            "status": event.status,
            "createdAt": _iso(event.created_at),
            "questionnaire": {
                "answers": questionnaire.answers if questionnaire else {},
                "elationDecides": questionnaire.elation_decides if questionnaire else {},
                "percentComplete": event.questionnaire_percent,
            },
            "moodboards": [
                {"title": b.title, "summary": b.summary, "palette": b.palette, "source": b.source, "liked": b.liked,
                 "createdAt": _iso(b.created_at), "items": items_for(b)}
                for b in moodboards
                if b.event_id == event.id
            ],
            # Current budget at today's prices; quote requests below keep the prices they were sent with.
            "budget": [
                {"category": line.category, "sku": item.sku, "name": item.name, "quantity": line.quantity,
                 "included": line.included, "unitPricePkr": item.price_pkr}
                for line, item in budget_lines
                if line.event_id == event.id
            ],
            "quoteRequests": [
                {"status": q.status, "totalPkr": q.total_pkr, "targetBudgetPkr": q.target_budget_pkr,
                 "budgetStatus": q.budget_status, "note": q.client_note, "lines": q.lines_snapshot,
                 "createdAt": _iso(q.created_at)}
                for q in quotes
                if q.event_id == event.id
            ],
        }

    return {
        "exportedAt": datetime.now(UTC).isoformat(),
        "profile": {
            "name": client.full_name,
            "email": client.email,
            "phone": client.phone,
            "city": client.city,
            "clientRole": client.client_role,
            "partnerName": client.partner_name,
            "emergencyContactName": client.emergency_contact_name,
            "emergencyContactPhone": client.emergency_contact_phone,
            "accessExpiresAt": _iso(client.access_expires_at),
            "consent": client.consent,
            "notifications": notification_prefs(client),
            "createdAt": _iso(client.created_at),
        },
        "events": [event_out(e) for e in events],
        "messages": [
            {"from": "you" if m.sender_role == "client" else "elation", "body": m.body, "sentAt": _iso(m.created_at)}
            for m in messages
        ],
    }
