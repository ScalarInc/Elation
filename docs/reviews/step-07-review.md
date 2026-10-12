# Step 7 review — Moodboard backend

**Date:** 2026-10-13 · **Panel:** Backend Lead · Frontend Lead · Product/Elation Ops · DevOps · Security & Data
**Verdict:** ✅ Approved after fixes below.

## What was reviewed

- Engine: `server/src/modules/moodboards/engine/` (slots, hard filters, scoring, variants, colour maths)
- API: `server/src/modules/moodboards/{service,routes}.ts`, questionnaire submit → first concepts
- Shared: `packages/shared/src/moodboard/`, `packages/shared/src/api/moodboards.ts`
- Webapp: `data/moodboards.ts`, `MoodboardViewer`, `MoodboardsPage`, `RecentMoodboards`, event overview

## Evidence

| Check | Result |
| --- | --- |
| Engine unit tests (gates, florals, ceiling, colours to avoid, absolute-no list, event types, determinism, A/B/C diversity ≥ 30 %, palette fit, pins after reorder, pins re-checked against the brief, golden test over the seeded questionnaires) | 14 pass |
| API tests (generate from answers, Q132 one board, Idempotency-Key, validation, submit → first concepts, save → primary + library, like/rename/duplicate/archive, reorder/lock/swap/regenerate-with-pins, swap guards, lead hand-over + draft retirement, consult, policy + client field hiding) | 12 pass |
| Whole suite | server 135 · shared 54 · webapp 3 — all pass; typecheck, lint, build clean |
| Browser (Malaika, Whispers of Noor) | Regenerate → A/B/C in order; drawer shows reasons + "price on request"; alternatives → "Use this" swaps and pins the piece; drag reorder persists; no console errors |

## Findings

| # | Persona | Finding | Severity | Resolution |
| --- | --- | --- | --- | --- |
| 1 | Product / Ops | "No ceiling décor" only excluded items whose *only* area was ceiling — a hanging lantern also tagged for the entrance slipped through. | High | **Fixed** — an item's first area tag is its main use; items whose main use is ceiling, and all chandeliers, are excluded. Multi-use pieces (e.g. hydrangeas: stage; dining; ceiling) stay. Test added. |
| 2 | Backend Lead | Pinned tiles were carried into the next generation by stored *position*, which changes when the client drags tiles — pins landed in the wrong area or vanished. | High | **Fixed** — pins match a slot by area; a pin whose area left the brief is appended, never dropped. Test added. |
| 3 | Product / Ops | A pinned piece survived regeneration even after the client changed an answer that now excludes it (e.g. said no to florals). | High | **Fixed** — pins are re-checked against the hard filters on every generation. Test added. |
| 4 | Security | The swap endpoint accepted any active item: a crafted request could put a floral on a florally-averse board or a chair in a backdrop slot. | Medium | **Fixed** — same rules as the alternatives list (same category, `excludedBy`); 422 `SWAP_NOT_ALLOWED`. Test added. |
| 5 | Backend Lead | Two concurrent "Save" clicks on an event with no lead concept could both try to set primary → unique-index error (500). `/save` also silently restored archived concepts. | Medium | **Fixed** — primary changes lock the event row (`SELECT … FOR UPDATE`) and re-count inside the transaction; saving an archived concept is a 422. |
| 6 | Backend Lead | Unsaved drafts from every past generation accumulated and showed under `?status=draft`. | Medium | **Fixed** — a new generation archives the event's previous unsaved, non-lead drafts (saved concepts untouched). Test added. |
| 7 | Backend Lead | Submit rethrew unexpected curation errors after the questionnaire had committed → client saw a 500 and retried. | Medium | **Fixed** — first concepts are generated in the route after the submit returns from the service; any failure is logged, never returned. |
| 8 | Frontend Lead | `fetchGenerate` bypassed `apiFetch` (hard-coded base, skipped the shared 401/expiry handling); the Idempotency-Key was minted inside `mutationFn`. | Medium | **Fixed** — `apiFetch` accepts `headers`; the key is created per click and passed in. |
| 9 | Frontend Lead | Optimistic drag reorder never rolled back when the server rejected it. | Medium | **Fixed** — on error the event's concepts are refetched. |
| 10 | Security | "Ask my consultant" had no rate limit; each call writes to the consultant's feed. | Medium | **Fixed** — 30/hour per user. |
| 11 | Security | Tile `score` includes a stock penalty, so clients could infer low stock although `stockQty` is hidden. | Medium | **Fixed** — `score` is `null` for clients (tiles and alternatives). Test added. |
| 12 | Product / Ops | Archiving the lead concept left the event with none, and budget/AR "follow the primary". | Question → decided | **P25** below. |
| 13 | Product / Ops | Q132 "2–3 concepts" and "one recommended + alternatives" both give 3; unanswered gives 3. | Question → decided | **P26** below. |
| 14 | DevOps | Idempotency map is in memory per instance. | Info | Accepted: one Railway instance at launch; move to Postgres/Redis if we scale out (noted in step-14). |
| 15 | Frontend Lead | "Add to budget" and "Apply to budget" are not wired. | Info | Step 8. |

## Decisions taken by the panel

- **P24 — Pins follow the area, not the grid position.** Clients rearrange freely; a pinned piece stays in its area on regenerate, survives if its area leaves the brief, and is dropped only when it breaks a hard filter.
- **P25 — There is always a lead concept while any concept is saved.** Removing the lead hands it to the newest saved concept.
- **P26 — Q132 → number of concepts.** "One Mood Board" = 1; "2–3 Concepts" and "One Recommended Concept + Alternatives" = 3 (A is the recommendation); unanswered = 3.
- **P27 — "No ceiling décor" excludes pieces whose main use (first area tag) is ceiling, and chandeliers.**
