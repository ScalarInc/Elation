from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from app.models import QuoteRequest
from app.schemas.base import CamelModel
from app.schemas.inventory import InventoryItemOut
from app.services.budget import PricedLine, Totals

BudgetStatus = Literal["green", "yellow", "red", "noTarget"]


class BudgetLineOut(CamelModel):
    id: UUID
    category: str
    inventory_item_id: UUID
    quantity: int
    included: bool
    source: str
    unit_price_pkr: int
    subtotal_pkr: int
    item_archived: bool


class CategoryTotal(CamelModel):
    category: str
    total_pkr: int
    count: int


class TotalsOut(CamelModel):
    total_pkr: int
    target_budget_pkr: int | None
    delta_pkr: int | None
    ratio: float | None
    status: BudgetStatus
    by_category: list[CategoryTotal]


class BudgetOut(CamelModel):
    event_id: UUID
    target_budget_pkr: int | None
    lines: list[BudgetLineOut]
    # Every item referenced by a line (including archived ones) so the client can show names and prices.
    items: list[InventoryItemOut]
    totals: TotalsOut

    @classmethod
    def build(cls, event_id: UUID, target: int | None, priced: list[PricedLine], totals: Totals) -> "BudgetOut":
        items = {p.item.id: p.item for p in priced}
        return cls(
            event_id=event_id,
            target_budget_pkr=target,
            lines=[
                BudgetLineOut(
                    id=p.line.id, category=p.line.category, inventory_item_id=p.item.id, quantity=p.line.quantity,
                    included=p.line.included, source=p.line.source, unit_price_pkr=p.item.price_pkr,
                    subtotal_pkr=p.subtotal_pkr, item_archived=not p.item.is_active,
                )
                for p in priced
            ],
            items=[InventoryItemOut.from_model(i) for i in items.values()],
            totals=TotalsOut(**totals.__dict__),
        )


class BudgetLineIn(CamelModel):
    id: UUID
    category: str = Field(min_length=1, max_length=40)
    inventory_item_id: UUID
    quantity: int = Field(ge=0, le=100_000)
    included: bool = True


class BudgetIn(CamelModel):
    target_budget_pkr: int | None = Field(default=None, ge=0, le=10_000_000_000)
    lines: list[BudgetLineIn] = Field(max_length=300)


class QuoteRequestIn(CamelModel):
    note: str | None = Field(default=None, max_length=1000)


class QuoteOut(CamelModel):
    id: UUID
    event_id: UUID
    status: Literal["new", "contacted", "closed"]
    total_pkr: int
    target_budget_pkr: int | None
    budget_status: BudgetStatus
    lines: list[dict]
    client_note: str | None
    created_at: datetime

    @classmethod
    def from_model(cls, quote: QuoteRequest) -> "QuoteOut":
        return cls(
            id=quote.id, event_id=quote.event_id, status=quote.status, total_pkr=quote.total_pkr,
            target_budget_pkr=quote.target_budget_pkr, budget_status=quote.budget_status, lines=quote.lines_snapshot,
            client_note=quote.client_note, created_at=quote.created_at,
        )
