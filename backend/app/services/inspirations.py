"""Inspiration concepts: admin content, adopting into an event, and ranking concepts for an event."""

import json
import logging
import math
import re
import secrets
from dataclasses import dataclass
from typing import Any

import httpx
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.errors import ApiError
from app.models import (
    ActivityEntry,
    BudgetLine,
    Event,
    Inspiration,
    InspirationItem,
    InventoryItem,
    Moodboard,
    MoodboardItem,
    QuestionnaireResponse,
)
from app.services import storage
from app.services.recommendations.rules import brief_for

logger = logging.getLogger("elation.inspirations")

IMAGE_BUCKET = "inspiration-images"
MAX_GALLERY_IMAGES = 12

# Which budget bucket an adopted item lands in, by inventory category.
BUDGET_BUCKET = {
    "Backdrop": "Stage", "Structure": "Stage", "Sofa": "Stage", "Chair": "Seating", "Table": "Dining",
    "Floral": "Florals", "Chandelier": "Ceiling", "Fabric": "Fabric", "Lighting": "Lighting",
    "Prop": "Entrance", "Signage": "Entrance",
}


def image_url(path: str | None) -> str | None:
    return storage.public_url(IMAGE_BUCKET, path)


def make_slug(db: Session, name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:50] or "concept"
    slug = base
    while db.scalar(select(Inspiration.id).where(Inspiration.slug == slug)) is not None:
        slug = f"{base}-{secrets.token_hex(2)}"
    return slug


def items_for(db: Session, inspiration_ids: list) -> dict:
    """inspiration id -> [(InspirationItem, InventoryItem)] in a single query."""
    result: dict = {i: [] for i in inspiration_ids}
    if not inspiration_ids:
        return result
    rows = db.execute(
        select(InspirationItem, InventoryItem)
        .join(InventoryItem, InventoryItem.id == InspirationItem.inventory_item_id)
        .where(InspirationItem.inspiration_id.in_(inspiration_ids))
    )
    for link, item in rows:
        result[link.inspiration_id].append((link, item))
    return result


def set_items(db: Session, inspiration: Inspiration, items: list[dict]) -> None:
    ids = {i["inventory_item_id"] for i in items}
    found = set(db.scalars(select(InventoryItem.id).where(InventoryItem.id.in_(ids)))) if ids else set()
    if found != ids:
        raise ApiError(400, "VALIDATION_FAILED", "One or more inventory items don't exist.")
    db.execute(delete(InspirationItem).where(InspirationItem.inspiration_id == inspiration.id))
    for i in items:
        db.add(InspirationItem(inspiration_id=inspiration.id, inventory_item_id=i["inventory_item_id"], quantity=i["quantity"]))


def add_image(inspiration: Inspiration, content: bytes, content_type: str, as_cover: bool) -> None:
    if not as_cover and len(inspiration.image_paths) >= MAX_GALLERY_IMAGES:
        raise ApiError(400, "VALIDATION_FAILED", f"A concept can have at most {MAX_GALLERY_IMAGES} gallery images.")
    path = storage.upload_image(IMAGE_BUCKET, str(inspiration.id), content, content_type)
    if as_cover:
        storage.delete_object(IMAGE_BUCKET, inspiration.cover_image_path)
        inspiration.cover_image_path = path
    else:
        inspiration.image_paths = [*inspiration.image_paths, path]


def remove_image(inspiration: Inspiration, path: str) -> None:
    if path not in inspiration.image_paths:
        raise ApiError(404, "NOT_FOUND", "Image not found on this concept.")
    inspiration.image_paths = [p for p in inspiration.image_paths if p != path]
    storage.delete_object(IMAGE_BUCKET, path)


# ---------------------------------------------------------------------------
# Adopting a concept into an event
# ---------------------------------------------------------------------------


def _adopted_quantity(item: InventoryItem, quantity: int, guests: int) -> int:
    """Seating and tables follow the event's guest count; everything else keeps the concept's quantity."""
    if item.category == "Chair":
        return guests
    if item.category == "Table":
        return math.ceil(guests / 10)
    return quantity


def adopt(db: Session, inspiration: Inspiration, event: Event) -> tuple[Moodboard, bool]:
    """Create a moodboard from the concept. Also drafts the budget if it's still empty.

    Returns (moodboard, budget_drafted)."""
    rows = [(link, item) for link, item in items_for(db, [inspiration.id])[inspiration.id] if item.is_active]
    board = Moodboard(
        event_id=event.id, title=inspiration.name, summary=inspiration.summary, palette=inspiration.palette,
        style=" · ".join(inspiration.style_tags) or None, source="inspiration", inspiration_id=inspiration.id,
    )
    db.add(board)
    db.flush()
    for position, (link, item) in enumerate(rows):
        db.add(MoodboardItem(
            moodboard_id=board.id, inventory_item_id=item.id, position=position,
            suggested_qty=_adopted_quantity(item, link.quantity, event.guest_count),
            budget_category=BUDGET_BUCKET.get(item.category, "Other"), reason=f"Part of the {inspiration.name} concept.",
        ))

    budget_empty = db.scalar(select(BudgetLine.id).where(BudgetLine.event_id == event.id).limit(1)) is None
    if budget_empty and rows:
        for position, (link, item) in enumerate(rows):
            db.add(BudgetLine(
                event_id=event.id, inventory_item_id=item.id, category=BUDGET_BUCKET.get(item.category, "Other"),
                quantity=_adopted_quantity(item, link.quantity, event.guest_count), included=True,
                source="inspiration", position=position,
            ))

    db.add(ActivityEntry(
        client_id=event.client_id, event_id=event.id, actor_id=event.client_id, kind="moodboard",
        title=f"Adopted {inspiration.name}", detail="Concept carried into your moodboard" + (" and budget" if budget_empty and rows else ""),
    ))
    db.commit()
    db.refresh(board)
    return board, budget_empty and bool(rows)


# ---------------------------------------------------------------------------
# Recommending concepts for an event
# ---------------------------------------------------------------------------


@dataclass
class RankedConcept:
    inspiration: Inspiration
    reason: str
    estimated_cost_pkr: int


def _estimated_cost(rows: list, guests: int) -> int:
    return sum(item.price_pkr * _adopted_quantity(item, link.quantity, guests) for link, item in rows if item.is_active)


def _rules_rank(event: Event, keywords: set[str], concepts: list[tuple[Inspiration, int]]) -> list[RankedConcept]:
    target = event.target_budget_pkr
    scored = []
    for insp, cost in concepts:
        style_hits = [t for t in insp.style_tags if any(w in t.lower() for w in keywords)]
        value = (4 if event.type in insp.event_types else 0) + 2 * len(style_hits) + (1 if insp.is_featured else 0)
        fits = bool(target) and cost <= target
        value += 2 if fits else 0
        parts = []
        if event.type in insp.event_types:
            parts.append(f"designed for {event.type} events")
        if style_hits:
            parts.append(f"matches your {', '.join(style_hits[:2]).lower()} style")
        if fits:
            parts.append("fits your target budget")
        reason = ("Recommended: " + ", ".join(parts) + ".") if parts else "A versatile concept you can adapt."
        scored.append((value, RankedConcept(insp, reason, cost)))
    return [r for _, r in sorted(scored, key=lambda s: -s[0])]


def _groq_rank(payload: dict[str, Any]) -> list[dict[str, str]]:
    """Ask Groq to order concepts and give a one-line reason each. Raises on any problem."""
    settings = get_settings()
    if not settings.groq_api_key:
        raise RuntimeError("no key")
    refs = [c["id"] for c in payload["concepts"]]
    schema = {
        "type": "object", "additionalProperties": False, "required": ["ranking"],
        "properties": {"ranking": {"type": "array", "items": {
            "type": "object", "additionalProperties": False, "required": ["id", "reason"],
            "properties": {"id": {"type": "string", "enum": refs}, "reason": {"type": "string"}},
        }}},
    }
    response = httpx.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={"Authorization": f"Bearer {settings.groq_api_key}"},
        timeout=settings.groq_timeout_ms / 1000,
        json={
            "model": settings.groq_model,
            "messages": [
                {"role": "system", "content": (
                    "You are Elation's event design assistant. Rank the concepts from best to worst fit for this "
                    "event and give each a warm one-sentence reason (no client names). Consider event type, style, "
                    "palette and whether estimatedCostPkr fits targetBudgetPkr.")},
                {"role": "user", "content": json.dumps(payload, separators=(",", ":"))},
            ],
            "response_format": {"type": "json_schema", "json_schema": {"name": "ranking", "strict": True, "schema": schema}},
            "reasoning_effort": "low",
            "max_completion_tokens": 1200,
        },
    )
    response.raise_for_status()
    return json.loads(response.json()["choices"][0]["message"]["content"])["ranking"]


def recommend(db: Session, event: Event, limit: int = 3) -> list[RankedConcept]:
    published = list(db.scalars(select(Inspiration).where(Inspiration.is_published.is_(True))))
    if not published:
        return []
    item_rows = items_for(db, [i.id for i in published])
    concepts = [(i, _estimated_cost(item_rows[i.id], event.guest_count)) for i in published]

    saved = db.get(QuestionnaireResponse, event.id)
    keywords = brief_for(event, saved.answers if saved else {}, {}).keywords()
    ranked = _rules_rank(event, keywords, concepts)
    shortlist = ranked[:8]  # small payload keeps Groq within the free-tier token limit

    try:
        payload = {
            "event": {"type": event.type, "guestCount": event.guest_count, "venueSetting": event.venue_setting,
                      "targetBudgetPkr": event.target_budget_pkr, "styleWords": sorted(keywords)[:20]},
            "concepts": [
                {"id": f"c{n}", "name": r.inspiration.name, "styleTags": r.inspiration.style_tags,
                 "eventTypes": r.inspiration.event_types, "palette": r.inspiration.palette,
                 "budgetTier": r.inspiration.budget_tier, "estimatedCostPkr": r.estimated_cost_pkr,
                 "summary": (r.inspiration.summary or "")[:200]}
                for n, r in enumerate(shortlist, start=1)
            ],
        }
        by_ref = {f"c{n}": r for n, r in enumerate(shortlist, start=1)}
        ordered, seen = [], set()
        for entry in _groq_rank(payload):
            concept = by_ref.get(entry["id"])
            if concept and entry["id"] not in seen:
                seen.add(entry["id"])
                ordered.append(RankedConcept(concept.inspiration, entry["reason"][:240] or concept.reason, concept.estimated_cost_pkr))
        ordered += [r for ref, r in by_ref.items() if ref not in seen]  # never lose a concept
        return ordered[:limit]
    except Exception as exc:  # any Groq issue: fall back to the deterministic ranking
        logger.info("Concept ranking via rules: %s", exc.__class__.__name__)
        return ranked[:limit]
