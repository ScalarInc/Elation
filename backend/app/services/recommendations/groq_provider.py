"""Groq provider: asks openai/gpt-oss-120b for a setup using strict JSON-schema output."""

import json
import logging
from typing import Any

import httpx

from app.config import get_settings
from app.services.recommendations.prompt import SYSTEM_PROMPT

logger = logging.getLogger("elation.groq")

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"


class GroqUnavailable(Exception):
    """Any reason to fall back to the rules provider (no key, timeout, HTTP error, bad output)."""


def _schema(candidate_ids: list[str], slot_keys: list[str]) -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["title", "summary", "palette", "picks"],
        "properties": {
            "title": {"type": "string"},
            "summary": {"type": "string"},
            "palette": {"type": "array", "items": {"type": "string"}},
            "picks": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["slot", "inventoryItemId", "quantity", "reason"],
                    "properties": {
                        "slot": {"type": "string", "enum": slot_keys},
                        "inventoryItemId": {"type": "string", "enum": candidate_ids},
                        "quantity": {"type": "integer"},
                        "reason": {"type": "string"},
                    },
                },
            },
        },
    }


def suggest(payload: dict[str, Any]) -> dict[str, Any]:
    settings = get_settings()
    if not settings.groq_api_key:
        raise GroqUnavailable("GROQ_API_KEY is not set")

    candidate_ids = sorted({c["id"] for s in payload["slots"] for c in s["candidates"]})
    slot_keys = [s["slot"] for s in payload["slots"]]
    if not candidate_ids:
        raise GroqUnavailable("no candidates")

    body = {
        "model": settings.groq_model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False, separators=(",", ":"))},
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": "event_setup", "strict": True, "schema": _schema(candidate_ids, slot_keys)},
        },
        "reasoning_effort": "low",
        "max_completion_tokens": 1800,  # counted against the per-minute token limit, so keep it modest
        "temperature": 0.7,
    }
    try:
        response = httpx.post(
            GROQ_URL,
            headers={"Authorization": f"Bearer {settings.groq_api_key}"},
            json=body,
            timeout=settings.groq_timeout_ms / 1000,
        )
    except httpx.HTTPError as exc:
        raise GroqUnavailable(f"request failed: {exc.__class__.__name__}") from exc
    if response.status_code >= 400:
        logger.warning("Groq HTTP %s: %s", response.status_code, response.text[:300])
        raise GroqUnavailable(f"HTTP {response.status_code}")
    try:
        content = response.json()["choices"][0]["message"]["content"]
        return json.loads(content)
    except (KeyError, IndexError, ValueError, TypeError) as exc:
        raise GroqUnavailable("unreadable response") from exc
