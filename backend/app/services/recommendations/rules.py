"""Shared building blocks for recommendations: the setup "slots", candidate scoring and quantity rules.

Both providers (rules and Groq) pick inventory items for these slots. The service then validates
whatever they return against these same rules, so the model can never invent items or quantities.
"""

import math
from dataclasses import dataclass, field
from typing import Any

from app.models import Event, InventoryItem


@dataclass(frozen=True)
class Slot:
    """One part of an event setup, e.g. guest seating or the stage backdrop."""

    key: str
    budget_category: str  # bucket used on the budget page
    inventory_categories: tuple[str, ...]
    tags: tuple[str, ...] = ()
    optional: bool = False  # dropped first when trimming to fit the target budget


SLOTS: tuple[Slot, ...] = (
    Slot("stage-backdrop", "Stage", ("Backdrop",), ("stage",)),
    Slot("stage-seating", "Stage", ("Sofa",), ("stage",)),
    Slot("stage-platform", "Stage", ("Structure",), ("stage",)),
    Slot("guest-seating", "Seating", ("Chair",), ("seating", "dining")),
    Slot("dining-tables", "Dining", ("Table",), ("dining",)),
    Slot("centrepieces", "Florals", ("Floral",), ("dining",)),
    Slot("floral-accents", "Florals", ("Floral",), ("entrance", "stage"), optional=True),
    Slot("ceiling", "Ceiling", ("Chandelier", "Fabric", "Floral", "Lighting", "Structure"), ("ceiling",), optional=True),
    Slot("ambient-lighting", "Lighting", ("Lighting",), ("ambient", "romantic", "pathway"), optional=True),
    Slot("entrance", "Entrance", ("Structure", "Prop", "Signage"), ("entrance",), optional=True),
    Slot("lounge", "Seating", ("Sofa", "Table"), ("lounge",), optional=True),
    Slot("dance-floor", "Stage", ("Structure",), ("dance-floor",), optional=True),
    Slot("photo-area", "Entrance", ("Backdrop", "Signage", "Prop"), ("photo-area",), optional=True),
)
SLOTS_BY_KEY = {s.key: s for s in SLOTS}
BUDGET_CATEGORIES = tuple(sorted({s.budget_category for s in SLOTS}))


@dataclass
class Brief:
    """De-identified facts about the event that recommendations are based on."""

    event_type: str
    guest_count: int
    venue_setting: str
    target_budget_pkr: int | None
    answers: dict[str, Any] = field(default_factory=dict)
    mood: str | None = None
    style: str | None = None
    density: str | None = None
    venue: str | None = None

    def says_no(self, question_id: str) -> bool:
        return self.answers.get(question_id) == "No"

    @property
    def avoids_florals(self) -> bool:
        return self.says_no("q76_florals") or self.answers.get("q77_floral_intensity") == "Very Minimal"

    def keywords(self) -> set[str]:
        """Lower-cased words from style answers and controls, used to score item tags/colours."""
        words: set[str] = set()
        for key in ("q10_aesthetic", "q11_atmosphere", "q14_direction", "q17_entrance_style", "q31_stage_type",
                    "q47_ceiling_type", "q83_lighting", "q92_fabric_style", "q96_structure_type"):
            value = self.answers.get(key)
            for v in value if isinstance(value, list) else [value]:
                if isinstance(v, str):
                    words.update(w.strip("&/,").lower() for w in v.split())
        for v in (self.mood, self.style, self.venue, self.event_type, self.venue_setting):
            if v:
                words.update(w.lower() for w in v.split())
        return {w for w in words if len(w) > 2}


def brief_for(event: Event, answers: dict[str, Any], controls: dict[str, str | None]) -> Brief:
    return Brief(
        event_type=event.type,
        guest_count=event.guest_count,
        venue_setting=event.venue_setting,
        target_budget_pkr=event.target_budget_pkr,
        answers=answers,
        **controls,
    )


def slot_wanted(slot: Slot, brief: Brief) -> bool:
    """Honour the client's explicit "No" answers (conditional branching in the questionnaire)."""
    blocked = {
        "stage-backdrop": brief.says_no("q29_stage") or brief.says_no("q95_structures"),
        "stage-seating": brief.says_no("q29_stage"),
        "stage-platform": brief.says_no("q29_stage"),
        "dining-tables": brief.says_no("q61_tables"),
        "centrepieces": brief.says_no("q61_tables") or brief.avoids_florals,
        "floral-accents": brief.avoids_florals,
        "ceiling": brief.says_no("q46_ceiling"),
        "entrance": brief.says_no("q16_entrance"),
        "lounge": brief.says_no("q71_lounges"),
        "dance-floor": brief.answers.get("q40_dance") != "Yes",
        "photo-area": brief.answers.get("q102_photo") != "Yes",
    }
    return not blocked.get(slot.key, False)


def item_allowed(item: InventoryItem, brief: Brief) -> bool:
    if not item.is_active:
        return False
    if brief.avoids_florals and item.category == "Floral":
        return False
    if brief.says_no("q46_ceiling") and "ceiling" in item.tags:
        return False
    if brief.says_no("q56_floor") and "floor-seating" in item.tags:
        return False
    return True


def score(item: InventoryItem, slot: Slot, keywords: set[str]) -> float:
    """Higher is a better fit for the slot and the client's style words."""
    value = 0.0
    value += 3 * sum(1 for t in slot.tags if t in item.tags)
    text = " ".join([item.name, item.colour or "", item.material or "", *item.tags]).lower()
    value += sum(1 for w in keywords if w in text)
    return value


def candidates_for(slot: Slot, items: list[InventoryItem], brief: Brief) -> list[InventoryItem]:
    keywords = brief.keywords()
    fitting = [i for i in items if i.category in slot.inventory_categories and item_allowed(i, brief)]
    # Score, then cheaper first on ties so recommendations don't drift expensive by default.
    return sorted(fitting, key=lambda i: (-score(i, slot, keywords), i.price_pkr))


def default_quantity(slot: Slot, item: InventoryItem, brief: Brief) -> int:
    guests = max(brief.guest_count, 1)
    tables = math.ceil(guests / 10)
    by_slot = {
        "guest-seating": guests,
        "dining-tables": tables,
        "centrepieces": tables,
        "stage-seating": 2,
        "floral-accents": 4,
        "ambient-lighting": 8,
        "lounge": max(2, guests // 100),
        "stage-platform": 288,  # 24 ft × 12 ft
        "dance-floor": 400,  # 20 ft × 20 ft
    }
    if item.unit == "sqft" and slot.key == "ceiling":
        return min(4000, guests * 6)
    if item.unit == "linear ft":
        return 60
    if slot.key == "ceiling":
        return 3
    return by_slot.get(slot.key, 1)


def clamp_quantity(item: InventoryItem, quantity: int, brief: Brief) -> int:
    """Keep model-proposed quantities physically sensible for this guest count."""
    guests = max(brief.guest_count, 1)
    if item.category == "Chair":
        upper = guests
    elif item.category == "Table":
        upper = math.ceil(guests / 6)
    elif item.unit == "sqft":
        upper = 5000
    elif item.unit == "linear ft":
        upper = 1000
    else:
        upper = max(10, math.ceil(guests / 8))
    return max(1, min(int(quantity), upper))
