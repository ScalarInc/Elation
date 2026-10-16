"""Builds the de-identified payload sent to Groq.

Privacy rule: only what's needed to choose decor. Never names, emails, phone numbers,
partner/emergency contacts, venue name, event/concept name, uploads or messages.
"""

import re
from typing import Any

from app.models import InventoryItem
from app.services.recommendations.rules import Brief, Slot

# Design questions whose answers change which decor gets picked. Anything not listed here is never sent,
# including names, personalisation (names/monograms on signage, dance floor, photo area), cultural,
# religious and privacy answers, family traditions, uploads and the free-form "dream event" text.
# Groq's free tier is about 8,000 tokens per minute: only add an id if it materially changes picks.
DESIGN_QUESTION_IDS = (
    "q9_areas", "q10_aesthetic", "q11_atmosphere", "q12_theme", "q13_colours", "q14_direction", "q15_metallic",
    "q15_reference_avoid", "q19_avoid_colours",
    "q16_entrance", "q17_entrance_style", "q28_entrance_scale",
    "q29_stage", "q31_stage_type", "q32_stage_backdrop", "q35_stage_florals", "q38_stage_seating_type",
    "q40_dance", "q42_dance_finish",
    "q46_ceiling", "q47_ceiling_type", "q48_ceiling_intensity",
    "q51_seating", "q52_chair_colour", "q56_floor", "q57_floor_style",
    "q61_tables", "q62_table_shape", "q63_table_finish", "q69_centrepieces",
    "q71_lounges", "q72_lounge_style", "q74_lounge_pieces",
    "q76_florals", "q77_floral_intensity", "q81_floral_style",
    "q83_lighting", "q84_chandeliers", "q85_chandelier_style", "q87_mood",
    "q90_fabric", "q92_fabric_style", "q95_structures", "q96_structure_type", "q97_structure_material",
    "q99_installations", "q102_photo", "q103_photo_style",
    "q122_priorities", "q124_flex", "q125_must", "q126_no", "q130_control", "q133_feel",
)
FREE_TEXT_LIMIT = 400

_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_PHONE = re.compile(r"\+?\d[\d\s().-]{6,}\d")


def redact(text: str) -> str:
    """Remove contact details a client may have typed into a free-text answer."""
    return _PHONE.sub("[removed]", _EMAIL.sub("[removed]", text))[:FREE_TEXT_LIMIT]


def _clean(value: Any) -> Any:
    if isinstance(value, str):
        return redact(value)
    if isinstance(value, list):
        return [_clean(v) for v in value if isinstance(v, (str, int, float, bool))]
    if isinstance(value, dict):  # e.g. colour answer {desc, hex[]}
        return {k: _clean(v) for k, v in value.items() if k in ("desc", "hex")}
    if isinstance(value, (int, float, bool)):
        return value
    return None


def design_answers(answers: dict[str, Any]) -> dict[str, Any]:
    return {qid: _clean(answers[qid]) for qid in DESIGN_QUESTION_IDS if answers.get(qid) not in (None, "", [], {})}


def build_payload(
    brief: Brief, slots: list[tuple[Slot, list[InventoryItem]]], event_month: str
) -> tuple[dict[str, Any], dict[str, str]]:
    """Returns the payload and a map from short candidate refs ("c1", "c2"…) to real inventory ids.
    Short refs keep the request small (Groq's free tier limits tokens per minute)."""
    refs: dict[str, str] = {}
    ref_by_item: dict[str, str] = {}

    def ref(item: InventoryItem) -> str:
        key = str(item.id)
        if key not in ref_by_item:
            ref_by_item[key] = f"c{len(ref_by_item) + 1}"
            refs[ref_by_item[key]] = key
        return ref_by_item[key]

    def describe(item: InventoryItem) -> dict[str, Any]:
        details = {"id": ref(item), "name": item.name, "unit": item.unit, "pricePkr": item.price_pkr}
        if item.colour:
            details["colour"] = item.colour
        if item.tags:
            details["tags"] = item.tags
        return details

    payload = {
        "event": {
            "type": brief.event_type,
            "month": event_month,  # "2026-12": month only, never the exact date
            "guestCount": brief.guest_count,
            "venueSetting": brief.venue_setting,
            "targetBudgetPkr": brief.target_budget_pkr,
        },
        "direction": {k: v for k, v in {"mood": brief.mood, "style": brief.style, "floralDensity": brief.density,
                                        "venueFeel": brief.venue}.items() if v},
        "answers": design_answers(brief.answers),
        "slots": [
            {"slot": slot.key, "optional": slot.optional, "candidates": [describe(i) for i in items]}
            for slot, items in slots
        ],
    }
    return payload, refs


SYSTEM_PROMPT = (
    "You are Elation's event design assistant for luxury South Asian weddings and events. "
    "Choose decor from the candidate inventory to create one cohesive setup. Rules: pick at most one item per "
    "slot, only from that slot's candidates, by id; skip optional slots that don't suit the brief; keep the "
    "total (pricePkr x quantity) within targetBudgetPkr when it is set; quantities must suit the guest count. "
    "Write a short evocative title (max 6 words, no client names) and a two-sentence summary. Give each pick a "
    "one-line reason. Palette: 3 to 5 hex colours that match the brief."
)
