"""Moodboard / event-setup recommendations: prefilter → provider (Groq, else rules) → validate → save.

Prices and totals are always taken from the database here, never from the model.
"""

import logging
import re
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ActivityEntry, Event, InventoryItem, Moodboard, MoodboardItem, QuestionnaireResponse
from app.services.recommendations import groq_provider, prompt
from app.services.recommendations.rules import (
    SLOTS,
    SLOTS_BY_KEY,
    Brief,
    Slot,
    brief_for,
    candidates_for,
    clamp_quantity,
    default_quantity,
    slot_wanted,
)

logger = logging.getLogger("elation.recommendations")

CANDIDATES_PER_SLOT = 4
DEFAULT_PALETTE = ["#E3BFB9", "#E1CBAD", "#9AB1AE", "#CFAE96", "#FAF3EF"]  # brand colours
_HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")


@dataclass
class Pick:
    slot: Slot
    item: InventoryItem
    quantity: int
    reason: str

    @property
    def subtotal(self) -> int:
        return self.item.price_pkr * self.quantity


@dataclass
class Setup:
    title: str
    summary: str
    palette: list[str]
    picks: list[Pick]
    source: str  # "ai" | "rules"


def _answers(db: Session, event: Event) -> dict[str, Any]:
    saved = db.get(QuestionnaireResponse, event.id)
    return saved.answers if saved else {}


def _slot_candidates(db: Session, brief: Brief) -> list[tuple[Slot, list[InventoryItem]]]:
    items = list(db.scalars(select(InventoryItem).where(InventoryItem.is_active.is_(True))))
    result = []
    for slot in SLOTS:
        if not slot_wanted(slot, brief):
            continue
        candidates = candidates_for(slot, items, brief)[:CANDIDATES_PER_SLOT]
        if candidates:
            result.append((slot, candidates))
    return result


def _rules_picks(slots: list[tuple[Slot, list[InventoryItem]]], brief: Brief) -> list[Pick]:
    picks = []
    for slot, candidates in slots:
        item = candidates[0]
        picks.append(Pick(slot, item, default_quantity(slot, item, brief), f"Best match in inventory for {slot.key.replace('-', ' ')}."))
    return picks


def _validated_ai_picks(raw: dict[str, Any], slots: list[tuple[Slot, list[InventoryItem]]], brief: Brief) -> list[Pick]:
    """Keep only picks that reference a real candidate for that slot; one per slot; sane quantities."""
    allowed = {slot.key: {str(i.id): i for i in items} for slot, items in slots}
    picks: dict[str, Pick] = {}
    for p in raw.get("picks", []):
        slot_key, item_id = p.get("slot"), p.get("inventoryItemId")
        item = allowed.get(slot_key, {}).get(item_id)
        if item is None or slot_key in picks:
            continue
        quantity = p.get("quantity") if isinstance(p.get("quantity"), int) else default_quantity(SLOTS_BY_KEY[slot_key], item, brief)
        reason = str(p.get("reason") or "")[:240]
        picks[slot_key] = Pick(SLOTS_BY_KEY[slot_key], item, clamp_quantity(item, quantity, brief), reason)
    # Never leave out a core (non-optional) part of the setup.
    for slot, candidates in slots:
        if not slot.optional and slot.key not in picks:
            item = candidates[0]
            picks[slot.key] = Pick(slot, item, default_quantity(slot, item, brief), "Added to complete the core setup.")
    order = [s.key for s in SLOTS]
    return sorted(picks.values(), key=lambda p: order.index(p.slot.key))


def _fit_budget(picks: list[Pick], target: int | None) -> list[Pick]:
    """Drop optional parts (least essential first) until the setup fits the target budget."""
    if not target:
        return picks
    kept = list(picks)
    for pick in sorted((p for p in picks if p.slot.optional), key=lambda p: -SLOTS.index(p.slot)):
        if sum(p.subtotal for p in kept) <= target:
            break
        kept.remove(pick)
    return kept


def _palette(raw: list[Any] | None, answers: dict[str, Any]) -> list[str]:
    colours = answers.get("q13_colours")
    from_answers = colours.get("hex") if isinstance(colours, dict) else None
    for source in (raw, from_answers):
        valid = [c.upper() for c in (source or []) if isinstance(c, str) and _HEX.match(c)]
        if len(valid) >= 2:
            return valid[:5]
    return DEFAULT_PALETTE


def _rules_text(brief: Brief, event: Event) -> tuple[str, str]:
    look = " ".join(w for w in (brief.mood, brief.style) if w) or "Elation"
    title = f"{look} {event.type}"
    summary = (
        f"A {look.lower()} setup for {event.guest_count} guests, curated from Elation's inventory. "
        "Adjust the direction on the left and regenerate to explore alternatives."
    )
    return title, summary


def build_setup(db: Session, event: Event, controls: dict[str, str | None]) -> Setup:
    answers = _answers(db, event)
    brief = brief_for(event, answers, controls)
    slots = _slot_candidates(db, brief)

    try:
        payload, refs = prompt.build_payload(brief, slots, event.event_date.strftime("%Y-%m"))
        raw = groq_provider.suggest(payload)
        for p in raw.get("picks", []):  # map short refs back to real inventory ids
            p["inventoryItemId"] = refs.get(p.get("inventoryItemId"))
        picks = _validated_ai_picks(raw, slots, brief)
        title = str(raw.get("title") or "").strip()[:80]
        summary = str(raw.get("summary") or "").strip()[:600]
        if not picks or not title:
            raise groq_provider.GroqUnavailable("empty output")
        source, palette = "ai", _palette(raw.get("palette"), answers)
    except groq_provider.GroqUnavailable as exc:
        logger.info("Using rules provider: %s", exc)
        picks, palette, source = _rules_picks(slots, brief), _palette(None, answers), "rules"
        title, summary = _rules_text(brief, event)

    return Setup(title, summary, palette, _fit_budget(picks, brief.target_budget_pkr), source)


def generate_moodboard(db: Session, event: Event, controls: dict[str, str | None]) -> Moodboard:
    setup = build_setup(db, event, controls)
    moodboard = Moodboard(
        event_id=event.id, title=setup.title, summary=setup.summary, palette=setup.palette, source=setup.source,
        mood=controls.get("mood"), style=controls.get("style"), density=controls.get("density"), venue=controls.get("venue"),
    )
    db.add(moodboard)
    db.flush()
    for position, pick in enumerate(setup.picks):
        db.add(
            MoodboardItem(
                moodboard_id=moodboard.id, inventory_item_id=pick.item.id, position=position,
                suggested_qty=pick.quantity, budget_category=pick.slot.budget_category, reason=pick.reason,
            )
        )
    db.add(
        ActivityEntry(
            client_id=event.client_id, event_id=event.id, actor_id=event.client_id, kind="moodboard",
            title=f"New concept: {setup.title}", detail=f"{len(setup.picks)} items from Elation's inventory",
        )
    )
    db.commit()
    db.refresh(moodboard)
    return moodboard
