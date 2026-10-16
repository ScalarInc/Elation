"""Recommendations: rules honour "No" answers, AI output is validated, and the Groq payload is de-identified."""

import json
import uuid
from datetime import UTC, datetime

import pytest

from app.models import Event, InventoryItem
from app.seed.inventory_seed import SEED_ITEMS
from app.services.recommendations import groq_provider, prompt, service
from app.services.recommendations.rules import SLOTS_BY_KEY, brief_for, clamp_quantity


def catalogue() -> list[InventoryItem]:
    return [
        InventoryItem(id=uuid.uuid4(), sku=sku, name=name, category=cat, unit=unit, price_pkr=price, colour=colour,
                      material=material, tags=tags, is_active=True)
        for sku, name, cat, unit, price, colour, material, tags in SEED_ITEMS
    ]


def make_event(**overrides) -> Event:
    values = dict(id=uuid.uuid4(), client_id=uuid.uuid4(), name="Ayla & Omar", concept="Our Secret Garden", type="Mehndi",
                  event_date=datetime(2026, 12, 14, 12, tzinfo=UTC), venue_name="Private Farmhouse 12", venue_city="Lahore",
                  venue_setting="Outdoor", guest_count=200, target_budget_pkr=None)
    values.update(overrides)
    return Event(**values)


class FakeDb:
    def __init__(self, items, answers=None):
        self.items, self.answers = items, answers or {}

    def scalars(self, _query):
        return [i for i in self.items if i.is_active]

    def get(self, _model, _key):
        return type("Q", (), {"answers": self.answers})() if self.answers else None


def groq_off(_payload):
    raise groq_provider.GroqUnavailable("off")


def setup_for(answers=None, target=None, groq=None, monkeypatch=None):
    items = catalogue()
    monkeypatch.setattr(groq_provider, "suggest", groq or groq_off)
    event = make_event(target_budget_pkr=target)
    return service.build_setup(FakeDb(items, answers), event, {"mood": "Romantic", "style": None, "density": None, "venue": None}), items


def test_rules_fallback_builds_a_core_setup(monkeypatch) -> None:
    setup, _ = setup_for(monkeypatch=monkeypatch)
    slots = {p.slot.key for p in setup.picks}
    assert setup.source == "rules"
    assert {"stage-backdrop", "guest-seating", "dining-tables"} <= slots
    chairs = next(p for p in setup.picks if p.slot.key == "guest-seating")
    assert chairs.quantity == 200 and chairs.item.category == "Chair"


def test_no_answers_are_respected(monkeypatch) -> None:
    setup, _ = setup_for({"q76_florals": "No", "q46_ceiling": "No", "q29_stage": "No"}, monkeypatch=monkeypatch)
    assert not any(p.item.category == "Floral" for p in setup.picks)
    assert not any("ceiling" in p.item.tags for p in setup.picks)
    assert not any(p.slot.budget_category == "Stage" for p in setup.picks)


def test_optional_parts_are_dropped_to_fit_the_budget(monkeypatch) -> None:
    roomy, _ = setup_for(monkeypatch=monkeypatch)
    tight, _ = setup_for(target=300_000, monkeypatch=monkeypatch)
    assert len(tight.picks) < len(roomy.picks)
    dropped = [p for p in roomy.picks if p.slot.key not in {t.slot.key for t in tight.picks}]
    assert dropped and all(p.slot.optional for p in dropped)  # core parts are never dropped


def test_ai_picks_are_validated(monkeypatch) -> None:
    captured = {}

    def fake_groq(payload):
        captured["payload"] = payload
        seating = next(s for s in payload["slots"] if s["slot"] == "guest-seating")
        backdrop = next(s for s in payload["slots"] if s["slot"] == "stage-backdrop")
        return {
            "title": "Blush Garden Mehndi", "summary": "Soft and warm.", "palette": ["#E3BFB9", "#9AB1AE", "not-a-colour"],
            "picks": [
                {"slot": "guest-seating", "inventoryItemId": seating["candidates"][0]["id"], "quantity": 99_999, "reason": "fits"},
                {"slot": "guest-seating", "inventoryItemId": seating["candidates"][1]["id"], "quantity": 5, "reason": "dup slot"},
                {"slot": "stage-backdrop", "inventoryItemId": "c999", "quantity": 1, "reason": "invented"},
                {"slot": "stage-backdrop", "inventoryItemId": seating["candidates"][0]["id"], "quantity": 1, "reason": "wrong slot"},
            ],
        }

    setup, _ = setup_for(groq=fake_groq, monkeypatch=monkeypatch)
    assert setup.source == "ai" and setup.title == "Blush Garden Mehndi"
    chairs = [p for p in setup.picks if p.slot.key == "guest-seating"]
    assert len(chairs) == 1 and chairs[0].quantity == 200  # clamped to guest count
    backdrop = next(p for p in setup.picks if p.slot.key == "stage-backdrop")
    assert backdrop.item.category == "Backdrop"  # invented/wrong ids replaced with a real candidate
    assert setup.palette == ["#E3BFB9", "#9AB1AE"]  # invalid colours dropped


def test_groq_payload_contains_no_direct_identifiers(monkeypatch) -> None:
    captured = {}

    def capture(payload):
        captured["p"] = payload
        raise groq_provider.GroqUnavailable("captured")

    monkeypatch.setattr(groq_provider, "suggest", capture)
    answers = {"q12_theme": "Call me on +92 300 1234567 or ayla@example.com", "q5_venue": "Private Farmhouse 12",
               "q2_name": "Our Secret Garden", "q10_aesthetic": ["Romantic"]}
    service.build_setup(FakeDb(catalogue(), answers), make_event(), {})
    text = json.dumps(captured["p"])
    for secret in ("Ayla", "Omar", "Secret Garden", "Farmhouse", "1234567", "ayla@example.com", "2026-12-14"):
        assert secret not in text, secret
    assert captured["p"]["event"]["month"] == "2026-12"
    assert "[removed]" in captured["p"]["answers"]["q12_theme"]


def test_missing_key_means_rules(monkeypatch) -> None:
    monkeypatch.setattr(groq_provider, "get_settings", lambda: type("S", (), {"groq_api_key": None})())
    with pytest.raises(groq_provider.GroqUnavailable):
        groq_provider.suggest({"slots": []})


def test_quantity_clamps() -> None:
    brief = brief_for(make_event(guest_count=120), {}, {})
    chair = InventoryItem(category="Chair", unit="each")
    table = InventoryItem(category="Table", unit="each")
    assert clamp_quantity(chair, 500, brief) == 120
    assert clamp_quantity(table, 500, brief) == 20
    assert clamp_quantity(chair, 0, brief) == 1
    assert SLOTS_BY_KEY["guest-seating"].budget_category == "Seating"


def test_prompt_redaction() -> None:
    assert prompt.redact("mail a.b@c.co now") == "mail [removed] now"


def test_groq_only_gets_whitelisted_design_answers(monkeypatch) -> None:
    captured = {}

    def capture(payload):
        captured["p"] = payload
        raise groq_provider.GroqUnavailable("captured")

    monkeypatch.setattr(groq_provider, "suggest", capture)
    sensitive = {
        "q2_name": "Ayla & Omar", "q3_date": "2026-12-14", "q5_venue": "Private Farmhouse 12",
        "q8_upload": ["venue.jpg"], "q13_reference_upload": ["pin.png"],
        "q25_signage_content": ["Names"], "q45_dance_personalisation": ["Monogram"],
        "q104_photo_personalisation": ["Couple's Name"], "q110_cultural": "Quran recitation corner",
        "q111_cultural_avoid": "No idols", "q112_traditions": "Grandmother's dupatta",
        "q113_privacy": ["Ladies/Gents Separation"], "q101_symbolic": "Our initials A&O", "q134_dream": "Ayla's dream",
        "q119_prayer_area": "Yes", "q64_table_quantity": "20 tables",
    }
    design = {"q81_floral_style": "Romantic", "q85_chandelier_style": "Crystal", "q19_avoid_colours": "orange"}
    service.build_setup(FakeDb(catalogue(), {**sensitive, **design}), make_event(), {})
    sent = captured["p"]["answers"]
    assert set(sent) == set(design)
    assert set(sent) <= set(prompt.DESIGN_QUESTION_IDS)
    text = json.dumps(captured["p"])
    for value in ("Quran", "idols", "dupatta", "Ladies", "A&O", "Ayla", "venue.jpg", "pin.png", "Couple"):
        assert value not in text, value
