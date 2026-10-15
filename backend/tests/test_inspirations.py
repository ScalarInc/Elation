"""Inspiration rules: adoption scales seating to guests, ranking prefers fitting concepts."""

import uuid
from datetime import UTC, datetime

import pytest

from app.models import Event, Inspiration, InventoryItem
from app.services import inspirations
from tests.helpers import FakeSession, auth_header, client_with, make_profile, use_local_jwks


@pytest.fixture(autouse=True)
def local_jwks(monkeypatch):
    use_local_jwks(monkeypatch)


def make_event(**overrides) -> Event:
    values = dict(id=uuid.uuid4(), client_id=uuid.uuid4(), name="x", type="Walima", event_date=datetime(2026, 12, 1, tzinfo=UTC),
                  venue_name="x", venue_city="x", venue_setting="Indoor", guest_count=300, target_budget_pkr=1_000_000)
    values.update(overrides)
    return Event(**values)


def make_inspiration(**overrides) -> Inspiration:
    values = dict(id=uuid.uuid4(), slug="x", name="Concept", summary=None, style_tags=[], event_types=[], palette=[],
                  budget_tier=None, is_featured=False, is_published=True)
    values.update(overrides)
    return Inspiration(**values)


def test_adopted_quantities_follow_guest_count() -> None:
    chair = InventoryItem(category="Chair")
    table = InventoryItem(category="Table")
    backdrop = InventoryItem(category="Backdrop")
    assert inspirations._adopted_quantity(chair, 50, 300) == 300
    assert inspirations._adopted_quantity(table, 5, 300) == 30
    assert inspirations._adopted_quantity(backdrop, 1, 300) == 1


def test_rules_ranking_prefers_event_type_style_and_budget_fit() -> None:
    event = make_event()
    good = make_inspiration(name="Good", event_types=["Walima"], style_tags=["Regal"])
    over = make_inspiration(name="Over budget", event_types=["Walima"], style_tags=["Regal"])
    other = make_inspiration(name="Other type", event_types=["Mehndi"])
    ranked = inspirations._rules_rank(event, {"regal"}, [(other, 100), (over, 5_000_000), (good, 900_000)])
    assert [r.inspiration.name for r in ranked] == ["Good", "Over budget", "Other type"]
    assert "fits your target budget" in ranked[0].reason


def test_slug_is_unique_even_for_duplicate_names() -> None:
    class SlugTakenOnce:
        """The plain slug already exists; the suffixed one is free."""

        def __init__(self):
            self.answers = iter([uuid.uuid4(), None])

        def scalar(self, _query):
            return next(self.answers)

    assert inspirations.make_slug(SlugTakenOnce(), "Whispers of Noor").startswith("whispers-of-noor-")


def test_clients_cannot_use_admin_inspiration_routes() -> None:
    client = make_profile(invitation_status="accepted")
    response = client_with(FakeSession(client)).get("/api/admin/inspirations", headers=auth_header(client))
    assert response.status_code == 403


def test_palette_must_be_hex() -> None:
    from app.schemas.inspirations import InspirationCreate

    with pytest.raises(ValueError):
        InspirationCreate(name="Concept", palette=["blush"])
