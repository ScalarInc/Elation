"""Budget maths: traffic light thresholds, totals and excluded lines (no database)."""

import uuid

import pytest

from app.models import BudgetLine, InventoryItem
from app.services.budget import PricedLine, classify_budget, compute_totals, snapshot_lines


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


def test_quote_snapshot_is_frozen_against_later_price_changes() -> None:
    chairs = priced("Seating", 600, 100)
    skipped = priced("Stage", 60_000, 1, included=False)
    snapshot = snapshot_lines([chairs, skipped])
    assert len(snapshot) == 1 and snapshot[0]["unitPricePkr"] == 600 and snapshot[0]["subtotalPkr"] == 60_000

    chairs.item.price_pkr = 900  # an admin edits the price afterwards
    assert snapshot[0]["unitPricePkr"] == 600 and snapshot[0]["subtotalPkr"] == 60_000


def test_clients_cannot_open_another_clients_budget(monkeypatch) -> None:
    from datetime import UTC, datetime

    from app.models import Event
    from tests.helpers import FakeSession, auth_header, client_with, make_profile, use_local_jwks

    use_local_jwks(monkeypatch)
    owner, intruder = make_profile(), make_profile(invitation_status="accepted")
    event = Event(id=uuid.uuid4(), client_id=owner.id, name="x", type="Mehndi", event_date=datetime.now(UTC),
                  venue_name="x", venue_city="x", venue_setting="Both", guest_count=10)
    api = client_with(FakeSession(owner, intruder, event))
    assert api.get(f"/api/events/{event.id}/budget", headers=auth_header(intruder)).status_code == 404
    assert api.post(f"/api/events/{event.id}/quote-requests", headers=auth_header(intruder), json={}).status_code == 404
