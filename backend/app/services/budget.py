"""Budget estimator. The backend is the source of truth: totals always use live inventory prices,
and a quote request freezes prices, quantities and totals so later edits never change it."""

import logging
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.errors import ApiError
from app.models import ActivityEntry, BudgetLine, Event, InventoryItem, Profile, QuoteRequest
from app.services import email

logger = logging.getLogger("elation.budget")

MAX_LINES = 300


def classify_budget(total_pkr: int, target_pkr: int | None) -> str:
    """Traffic light: yellow < 90 % of target, green 90–100 % inclusive, red > 100 %. No tolerance.

    Integer maths (10 × total vs 9 × target) avoids floating-point edge cases at exactly 90 %.
    """
    if not target_pkr:
        return "noTarget"
    if total_pkr > target_pkr:
        return "red"
    if 10 * total_pkr >= 9 * target_pkr:
        return "green"
    return "yellow"


@dataclass
class PricedLine:
    line: BudgetLine
    item: InventoryItem

    @property
    def subtotal_pkr(self) -> int:
        return self.item.price_pkr * self.line.quantity if self.line.included else 0


@dataclass
class Totals:
    total_pkr: int
    target_budget_pkr: int | None
    delta_pkr: int | None
    ratio: float | None
    status: str
    by_category: list[dict]


def compute_totals(priced: list[PricedLine], target_pkr: int | None) -> Totals:
    by_category: dict[str, dict] = {}
    for p in priced:
        if not p.line.included:
            continue
        bucket = by_category.setdefault(p.line.category, {"category": p.line.category, "total_pkr": 0, "count": 0})
        bucket["total_pkr"] += p.subtotal_pkr
        bucket["count"] += 1
    total = sum(p.subtotal_pkr for p in priced)
    return Totals(
        total_pkr=total,
        target_budget_pkr=target_pkr,
        delta_pkr=total - target_pkr if target_pkr else None,
        ratio=round(total / target_pkr, 4) if target_pkr else None,
        status=classify_budget(total, target_pkr),
        by_category=sorted(by_category.values(), key=lambda c: -c["total_pkr"]),
    )


def load_priced_lines(db: Session, event_id: UUID) -> list[PricedLine]:
    rows = db.execute(
        select(BudgetLine, InventoryItem)
        .join(InventoryItem, InventoryItem.id == BudgetLine.inventory_item_id)
        .where(BudgetLine.event_id == event_id)
        .order_by(BudgetLine.position)
    )
    return [PricedLine(line, item) for line, item in rows]


def replace_lines(db: Session, event: Event, target_pkr: int | None, lines: list[dict]) -> None:
    """Save the whole budget. Line ids come from the client so they stay stable across saves."""
    if len(lines) > MAX_LINES:
        raise ApiError(400, "VALIDATION_FAILED", f"A budget can have at most {MAX_LINES} lines.")

    existing = {line.id: line for line in db.scalars(select(BudgetLine).where(BudgetLine.event_id == event.id))}
    item_ids = {line["inventory_item_id"] for line in lines}
    items = {i.id: i for i in db.scalars(select(InventoryItem).where(InventoryItem.id.in_(item_ids)))} if item_ids else {}
    already_used = {line.inventory_item_id for line in existing.values()}

    for line in lines:
        item = items.get(line["inventory_item_id"])
        if item is None:
            raise ApiError(400, "VALIDATION_FAILED", "A budget line references an unknown inventory item.")
        if not item.is_active and item.id not in already_used:
            raise ApiError(400, "ITEM_ARCHIVED", f"{item.name} is no longer available to add.")

    db.execute(delete(BudgetLine).where(BudgetLine.event_id == event.id))
    for position, line in enumerate(lines):
        previous = existing.get(line["id"])
        db.add(
            BudgetLine(
                id=line["id"], event_id=event.id, inventory_item_id=line["inventory_item_id"],
                category=line["category"].strip(), quantity=line["quantity"], included=line["included"],
                source=previous.source if previous else "manual", position=position,
            )
        )
    event.target_budget_pkr = target_pkr
    db.commit()


def snapshot_lines(priced: list[PricedLine]) -> list[dict]:
    """Frozen copy of the included lines: values are copied, so later price edits can't change them."""
    return [
        {
            "inventoryItemId": str(p.item.id), "sku": p.item.sku, "name": p.item.name, "category": p.line.category,
            "unit": p.item.unit, "unitPricePkr": p.item.price_pkr, "quantity": p.line.quantity,
            "subtotalPkr": p.subtotal_pkr,
        }
        for p in priced
        if p.line.included and p.line.quantity > 0
    ]


def create_quote_request(db: Session, event: Event, client: Profile, note: str | None) -> QuoteRequest:
    """Freeze the current budget. Prices are copied, not referenced."""
    priced = load_priced_lines(db, event.id)
    lines = snapshot_lines(priced)
    if not lines:
        raise ApiError(409, "EMPTY_BUDGET", "Add at least one included item before requesting a quote.")

    totals = compute_totals(priced, event.target_budget_pkr)
    quote = QuoteRequest(
        event_id=event.id,
        client_id=client.id,
        status="new",
        target_budget_pkr=event.target_budget_pkr,
        total_pkr=totals.total_pkr,
        budget_status=totals.status,
        lines_snapshot=lines,
        client_note=(note or "").strip() or None,
    )
    db.add(quote)
    db.add(
        ActivityEntry(
            client_id=client.id, event_id=event.id, actor_id=client.id, kind="budget",
            title="Quote requested", detail=f"{len(lines)} items · PKR {totals.total_pkr:,}",
        )
    )
    db.commit()
    db.refresh(quote)
    _notify_admins(client, event, quote)
    return quote


def _notify_admins(client: Profile, event: Event, quote: QuoteRequest) -> None:
    """Best effort: a failed email never fails the quote request."""
    to = get_settings().admin_notification_email
    if not to:
        return
    body = (
        f"{client.full_name} requested a quote for <b>{event.name}</b> ({event.type}): "
        f"PKR {quote.total_pkr:,} across {len(quote.lines_snapshot)} items."
    )
    try:
        email.send_email(to, f"Quote request: {client.full_name}", f"<p>{body}</p>")
    except Exception:
        logger.warning("Quote notification email not sent", exc_info=True)
