"""Budget maths: traffic light thresholds, totals and excluded lines (no database)."""

import uuid

import pytest

from app.models import BudgetLine, InventoryItem
from app.services.budget import PricedLine, classify_budget, compute_totals


@pytest.mark.parametrize(
    ("total", "target", "status"),
    [
        (899_999, 1_000_000, "yellow"),  # just under 90 %
        (900_000, 1_000_000, "green"),   # exactly 90 %
        (1_000_000, 1_000_000, "green"), # exactly 100 %
        (1_000_001, 1_000_000, "red"),   # any amount over: no tolerance
        (1_100_000, 1_000_000, "red"),   # the old 15 % tolerance is gone
        (0, 1_000_000, "yellow"),
        (500, None, "noTarget"),
        (500, 0, "noTarget"),
    ],
)
def test_traffic_light(total, target, status) -> None:
    assert classify_budget(total, target) == status


def priced(category: str, price: int, qty: int, included: bool = True) -> PricedLine:
    item = InventoryItem(id=uuid.uuid4(), name="x", price_pkr=price, is_active=True)
    line = BudgetLine(id=uuid.uuid4(), category=category, quantity=qty, included=included)
    return PricedLine(line, item)


def test_totals_use_unit_price_times_quantity_and_skip_excluded_lines() -> None:
    totals = compute_totals(
        [priced("Seating", 600, 200), priced("Stage", 35_000, 2), priced("Stage", 60_000, 1, included=False)],
        target_pkr=250_000,
    )
    assert totals.total_pkr == 600 * 200 + 35_000 * 2
    assert totals.delta_pkr == totals.total_pkr - 250_000
    assert totals.status == "yellow"  # 190k / 250k = 76 %
    assert [c["category"] for c in totals.by_category] == ["Seating", "Stage"]
    assert totals.by_category[1]["count"] == 1


def test_no_target_has_no_delta_or_ratio() -> None:
    totals = compute_totals([priced("Seating", 600, 10)], target_pkr=None)
    assert (totals.delta_pkr, totals.ratio, totals.status) == (None, None, "noTarget")
