"""Inventory rules: price edits keep history and clear the provisional flag; clients are read-only."""

import uuid
from datetime import UTC, datetime

import pytest

from app import constants
from app.models import InventoryItem, InventoryPriceHistory
from app.seed.inventory_seed import SEED_ITEMS
from app.services import inventory
from tests.helpers import FakeSession, auth_header, client_with, make_admin, make_profile, use_local_jwks


@pytest.fixture(autouse=True)
def local_jwks(monkeypatch):
    use_local_jwks(monkeypatch)


def make_item(**overrides) -> InventoryItem:
    values = dict(
        id=uuid.uuid4(), sku="chair-x", name="Chair", category="Chair", unit="each", price_pkr=600, colour=None,
        material=None, stock_qty=None, tags=[], image_path=None, is_active=True, is_provisional_price=True,
        price_updated_at=None, updated_at=datetime.now(UTC),
    )
    values.update(overrides)
    return InventoryItem(**values)


class InventorySession(FakeSession):
    def __init__(self, *objs):
        super().__init__(*objs)
        self.added = []

    def add(self, obj):
        self.added.append(obj)

    def refresh(self, _obj):
        pass


def test_price_change_records_history_and_clears_provisional() -> None:
    admin, item = make_admin(), make_item()
    session = InventorySession(admin, item)
    response = client_with(session).patch(f"/api/admin/inventory/{item.id}", headers=auth_header(admin), json={"pricePkr": 750})

    assert response.status_code == 200
    body = response.json()
    assert body["pricePkr"] == 750 and body["isProvisionalPrice"] is False
    history = [o for o in session.added if isinstance(o, InventoryPriceHistory)]
    assert len(history) == 1 and (history[0].old_price_pkr, history[0].new_price_pkr) == (600, 750)
    assert item.price_updated_by == admin.id


def test_confirming_a_provisional_price_unchanged_still_clears_the_flag() -> None:
    admin, item = make_admin(), make_item()
    inventory.change_price(InventorySession(), item, 600, admin)
    assert item.is_provisional_price is False


def test_unchanged_confirmed_price_writes_no_history() -> None:
    admin, item = make_admin(), make_item(is_provisional_price=False)
    session = InventorySession()
    inventory.change_price(session, item, 600, admin)
    assert session.added == []


def test_negative_price_rejected() -> None:
    admin, item = make_admin(), make_item()
    response = client_with(InventorySession(admin, item)).patch(
        f"/api/admin/inventory/{item.id}", headers=auth_header(admin), json={"pricePkr": -1}
    )
    assert response.status_code == 400


def test_clients_cannot_edit_inventory() -> None:
    client, item = make_profile(invitation_status="accepted"), make_item()
    response = client_with(InventorySession(client, item)).patch(
        f"/api/admin/inventory/{item.id}", headers=auth_header(client), json={"pricePkr": 1}
    )
    assert response.status_code == 403


def test_archived_items_hidden_from_clients() -> None:
    client, item = make_profile(invitation_status="accepted"), make_item(is_active=False)
    response = client_with(InventorySession(client, item)).get(f"/api/inventory/{item.id}", headers=auth_header(client))
    assert response.status_code == 404


def test_image_upload_rejects_non_images() -> None:
    with pytest.raises(Exception) as exc:
        inventory.upload_image(make_item(), b"%PDF", "application/pdf")
    assert getattr(exc.value, "code", None) == "VALIDATION_FAILED"


def test_seed_catalogue_is_valid() -> None:
    skus = [row[0] for row in SEED_ITEMS]
    assert len(skus) == len(set(skus)), "duplicate seed SKU"
    for sku, _name, category, unit, price, *_ in SEED_ITEMS:
        assert category in constants.INVENTORY_CATEGORIES, sku
        assert unit in constants.INVENTORY_UNITS, sku
        assert price > 0, sku
    assert any(row[2] == "Structure" for row in SEED_ITEMS)
