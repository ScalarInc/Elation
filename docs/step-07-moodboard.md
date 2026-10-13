# Step 7 — Moodboard backend

**Owner:** @Safwan · **Frontend wiring:** @KnightX_O · **Estimate:** 5 days (v1) · **Depends on:** Steps 4, 5, 6

> Priority item: *"Moodboard Backend: Complete backend development for the Moodboard functionality."*
> Spec: *"…the system uses AI-assisted recommendation logic to analyze and match suitable items from Elation's existing inventory, generating a personalized, inventory-aware moodboard and theme recommendation."*

## What the UI already expects

From `components/MoodboardViewer.tsx`, `pages/MoodboardsPage.tsx`, `RecentMoodboards.tsx`:

| UI action | Today | Needs |
| --- | --- | --- |
| Controls: mood, style, palette, density, venue (+ lock) — defaults from questionnaire via `deriveMoodboardDefaults` | local state | stored on the moodboard as `controls` |
| **Regenerate** | rotates the same fixture tiles after a 900 ms timeout | real generation from inventory |
| Concept A / B / C strip | `makeVariants()` rotates tiles/palette | real variants from one generation |
| Tiles with inventory pill | `tileItem(idx) = inventory[idx % len]` | each tile linked to a real `InventoryItem`, with reasons |
| Tile drawer → **Add to budget** | toast | adds a budget line (Step 8) |
| Tile drawer → **Ask for swap** | toast | instant alternatives + optional "ask my consultant" |
| **Save as concept** | toast | status `SAVED`, appears in library |
| Like (heart), Duplicate, Remove (library) | local state | persisted |
| Drag to reorder (planned with dnd-kit) | — | persisted order |
| Hide florals / ceiling tiles when client said no (`florallyAverse`, `noCeilingDecor`) | client-side filter | enforced by the engine |

## Data model (from Step 2)

`Moodboard` (one concept) → many `MoodboardTile`. Concepts from one generation share `generationId` and carry `variantLabel` A/B/C. One concept per event may be `isPrimary` — it's the one the budget seed and AR set follow.

## Curation engine v1 — rules-based scoring (`server/src/modules/moodboards/engine/`)

Pure function, no I/O, deterministic for a given `seed`:

```ts
generate(input: {
  event: { type, guests, budgetPkr, venueSetting }
  answers: VisibleAnswers            // from shared visibleAnswers()
  controls: { mood, style, palette: string[], density, venue, venueLocked }
  inventory: InventoryItem[]         // active items
  lockedTiles: TileSeed[]            // client-pinned tiles to keep
  variants: 1 | 2 | 3                // from Q132
  seed: string
}): ConceptDraft[]
```

### 1. Build slots (what areas need décor)

Start from Q9 "Which areas need décor?", then apply each category's Yes/No gate:

| Gate question | Area | Slot template (category → count) |
| --- | --- | --- |
| Q22 entrance = Yes | entrance | Backdrop/Floral 1 · Lighting 1 · Signage 1 (if Q24 = Yes) |
| Q29 stage = Yes | stage | Backdrop 1 · Sofa 1 (if Q37 = Yes) · Floral 1 (unless Q35 = No Florals) · Prop 1 |
| Q46 ceiling = Yes | ceiling | Chandelier 1 (if Q84 ≠ No) · Fabric or Floral 1 |
| Q61 tables = Yes | dining | Chair 1 · Table 1 · Floral/Lighting centrepiece 1 |
| Q71 lounges = Yes | lounge | Sofa 1 · Table 1 |
| Q56 floor seating = Yes | floor-seating | Chair (cushion) 1 · Table (low) 1 |
| Q102 photo area = Yes | photo-area | Signage/Backdrop 1 |
| Q40 dance floor = Yes | dance-floor | Lighting 1 |

Target 9–12 tiles. If fewer slots than 9, add "atmosphere" slots (lighting, fabric) — never florals if florally averse. Shared helpers `florallyAverse`, `noCeilingDecor` move from `derived.ts` into `packages/shared`.

### 2. Hard filters (an item can never appear if…)

- `active = false`, or category is excluded by a gate (no florals → no `FLORAL`; Q35 "No Florals" → none on stage).
- Colour clashes with Q19 "colours you absolutely do not want" (name match or ΔE < 10 against hex).
- Name/tags match keywords from Q15 / Q126 "absolute no's" / Q127 "strongly dislike" (simple lower-case token match; logged in `reasons` of the *rejected* list for consultant debugging).
- `eventTypes` non-empty and doesn't include the event's type.

### 3. Score each remaining candidate for each slot

```
score =  3.0 · areaMatch            (item.tags ∋ slot.area)
       + 2.0 · moodOverlap          (item.moodTags ∩ {controls.mood, Q10/Q11 mapped moods})
       + 1.5 · styleOverlap         (item.styleTags ∩ {controls.style, Q10 mapped styles})
       + 2.0 · paletteFit           (1 − min ΔE2000(item.colourHex, palette) / 50, clamped 0..1)
       + 1.0 · materialFit          (item.material ∈ Q26 / Q97 / Q94 preferred materials)
       + 1.0 · metallicFit          (Q21 metallic accents vs item colour: Gold, Rose Gold, Silver…)
       + 0.8 · densityFit           (florals: Heavy/Extremely Floral boost FLORAL, Minimal damps)
       + 0.5 · eventTypeFit         (item.eventTypes ∋ event.type)
       + 0.7 · budgetFit            (item price vs. budget-per-slot band: within band 1, 2× over 0)
       − 1.0 · stockPenalty         (stockQty known and < quantity the event needs)
```

Weights live in `engine/weights.ts` (and later an admin setting) so Elation's team can tune without code changes. Each term that contributes > 0.3 adds a human-readable reason: `"palette: blush (#E3BFB9)"`, `"mood: romantic"`, `"area: stage"`.

### 4. Pick per slot, build variants

- Concept A: highest score per slot; no item repeated across slots; at most 2 items of the same category per concept (diversity).
- "Near-tie band": candidates within `ε` of the best are considered equal; a seeded RNG picks among them. `ε` grows with creative freedom (Q130/Q131): *control closely* 2 % … *maximum freedom / surprise me* 15 %. This is what makes **Regenerate** produce something new while staying on-brief.
- Concept B: same slots, re-scored with the **secondary** mood/palette colour emphasised (e.g. palette rotated so the 2nd hex is dominant) — "Ivory" direction.
- Concept C: B's approach with the 3rd colour/alternate style — "Ember" direction.
- Locked tiles are copied into every variant at their positions.
- Title: `event.concept ?? "<Mood> <EventType>"`, variant suffix from the dominant colour name.
- Palette: client palette (Q13/Q16 hex) if given, else the top-4 colours of the chosen items.

### 5. Persist

One transaction: `Moodboard` rows (status `DRAFT`, `generator: "rules-v1"`, `controls`, seed) + tiles with `score` and `reasons`. Activity entry "Elation curated N new concepts". If this is the event's first moodboard, a system message is posted to the consultant thread.

### Quality bar for v1

A fixture-based golden test: for each of the 4 seeded events, the generated concept must (a) include no excluded categories, (b) have ≥ 70 % of tiles whose colour is within ΔE 20 of the palette, (c) be byte-identical for the same seed. Elation's team reviews 10 generated boards before launch (❓ **Needs Elation**).

## Curation v2 — LLM re-rank (after launch)

Behind the same endpoint; enabled per environment with `MOODBOARD_LLM=on`.

1. Rules engine returns the top 5 candidates per slot (not just the winner).
2. A pg-boss job sends Claude (model from `ANTHROPIC_MODEL`, default the current Sonnet) the design brief (visible answers, labels not ids), the candidate list per slot (id, name, colour, material, tags), and asks for a structured JSON response: chosen item id per slot, a concept title, and a 2–3 sentence narrative in Elation's voice.
3. The server **validates every returned id is in that slot's candidate list** — the model can only choose, never invent inventory. Invalid or timed-out response → keep the rules result.
4. Update the draft concepts, set `generator: "rules-v1+llm-v2"`, push `moodboard.ready` over the websocket; the UI crossfades to the refined board.
5. The static part of the prompt (instructions + inventory catalogue) is prompt-cached; per-request content is only the brief and candidates.
6. Copy rule: narrative is presented as "Elation's note", never mentioning AI.

## Endpoints

| Method | Path | Body → Response |
| --- | --- | --- |
| `GET` | `/moodboards?eventId=&status=saved\|draft&liked=` | Library across the user's events (MoodboardsPage, RecentMoodboards) |
| `GET` | `/events/:id/moodboards?generationId=` | Concepts for one event; default = latest generation + all saved |
| `GET` | `/events/:id/moodboards/defaults` | Controls derived from the questionnaire (`deriveMoodboardDefaults` moved server-side + shared) |
| `POST` | `/events/:id/moodboards/generate` | `{ controls, keepLockedFrom?: moodboardId }` + `Idempotency-Key` → `201 { generationId, concepts: MoodboardDto[] }`. Rate limit 20/hour/event. 422 `NO_INVENTORY_MATCH` if a slot has zero candidates (lists slots) |
| `GET` | `/moodboards/:id` | `MoodboardDto` with tiles + inventory items embedded |
| `PATCH` | `/moodboards/:id` | `{ title?, liked? }` |
| `POST` | `/moodboards/:id/save` | DRAFT → SAVED ("Save as concept") |
| `POST` | `/moodboards/:id/primary` | marks primary (unsets others); activity entry |
| `POST` | `/moodboards/:id/duplicate` | copy as SAVED "· Copy" |
| `DELETE` | `/moodboards/:id` | → ARCHIVED (library "Remove") |
| `PUT` | `/moodboards/:id/tiles/order` | `{ tileIds: string[] }` (drag reorder) |
| `PATCH` | `/moodboards/:id/tiles/:tileId` | `{ locked?, inventoryItemId? }` — lock, or apply a swap |
| `GET` | `/moodboards/:id/tiles/:tileId/alternatives` | Next-best 5 candidates for that tile's slot, with reasons ("Ask for swap" drawer) |
| `POST` | `/moodboards/:id/tiles/:tileId/consult` | `{ note? }` → system message to consultant "Client asked for an alternative to Ivory Curve Sofa" |
| `POST` | `/moodboards/:id/tiles` | `{ fileId }` add a client reference image tile |
| `POST` | `/moodboards/:id/apply-to-budget` | Adds every inventory tile not already in the budget plan (qty from Step 8 quantity rules); returns the updated plan |

`MoodboardDto` stays compatible with today's `Moodboard` (`id, eventId, title, tag, cover, tiles: string[], palette, createdAt, liked`) **plus** `status, variantLabel, generationId, isPrimary, controls, narrative, tileItems: { id, position, kind, imageUrl, item?: InventoryItemDto, reasons, locked }[]`. Keeping `tiles: string[]` (image URLs) lets the existing grid render unchanged during migration.

## Frontend changes (@KnightX_O)

| File | Change |
| --- | --- |
| `components/MoodboardViewer.tsx` | Load `GET /events/:id/moodboards` + `/defaults`; concept strip = concepts of the current generation; **Regenerate** → `generate` mutation (keep the skeleton + crossfade); **Save as concept** → `/save`; tile drawer uses `tileItems[i].item` (delete `tileItem()` and `makeVariants()`); "Ask for swap" opens alternatives list with "Use this" (PATCH tile) and "Ask my consultant" (`/consult`); **Add to budget** → Step 8 add-line endpoint; heart → `PATCH liked`; add lock icon per tile; "Why this?" popover shows `reasons` |
| `pages/MoodboardsPage.tsx` | `GET /moodboards?status=saved`; duplicate/remove/like via API |
| `components/RecentMoodboards.tsx` | `GET /moodboards?status=saved&limit=4` |
| `questionnaire/derived.ts` | Moodboard derivations move to `packages/shared`; file deleted after Step 4 + 7 |
| websocket hook | On `moodboard.ready` invalidate `['moodboards', eventId]` (v2) |

## Tests

- Engine unit tests: slot building for each gate; hard filters (florals, ceiling, excluded colour, absolute-no keyword); determinism by seed; variant diversity (A ≠ B ≠ C in ≥ 30 % of slots); locked tiles preserved.
- Golden tests on the 4 seeded events (above).
- API: generate → 3 drafts (Q132 = "2–3 concepts"); save → appears in library; primary uniqueness; alternatives exclude current item; policy matrix.

## Definition of done

- [x] Regenerate on any event returns concepts built only from active inventory, respecting every Yes/No gate in the questionnaire.
- [x] Every tile shows a real inventory item and at least one reason.
- [x] Saved concepts, likes, order, locks persist across devices.
- [ ] "Add to budget" from a tile adds a priced line to the event's budget plan. *(Step 8)*
- [x] `inventory[idx % len]` and `makeVariants` are gone; fixture boards remain only for `VITE_API_MODE=mock`.
- [ ] Elation has reviewed sample boards and signed off on weights (or given tuning notes). *(❓ Needs Elation)*

## As built (2026-10-13)

- **Engine** (`server/src/modules/moodboards/engine/`): pure functions, no DB access. `buildSlots` (Q9 areas + Yes/No gates; filler areas never re-add a gated "No"; 6–12 tiles), `excludedBy` (florals, no ceiling décor, colours to avoid by ΔE76, absolute-no keywords, items reserved for other event types), `scoreItem` with `WEIGHTS` (area 3, mood 2, palette 2, style 1.5, material 1, metallic 1, budget 0.7, density 0.8, event type 0.5, venue 0.3) and human-readable reasons, a seeded RNG that picks inside a near-tie band whose width follows the creativity answers (Q130/Q131), and variants A/B/C that rotate the mood/style/palette emphasis with a reuse penalty. 12 unit tests including a golden test over the seeded questionnaires.
- **Service/routes** (`server/src/modules/moodboards/`): every endpoint in the table above except `POST /moodboards/:id/tiles` (client reference images → Step 11, needs file storage) and `POST /moodboards/:id/apply-to-budget` (→ Step 8). Generate is rate-limited 20/hour/event and de-duplicated by `Idempotency-Key` (in-memory per instance, 10 min). Q132 "One Mood Board" → 1 concept, otherwise 3. The first saved concept becomes primary; primary uniqueness is also enforced by the partial unique index. Swapping a tile from alternatives locks it with reason "your choice"; locked tiles carry into every concept of the next generation (`keepLockedFrom`). Clients never see `stockQty`/`notes`.
- **Review fixes** ([review](reviews/step-07-review.md)): pins follow their area (P24) and are re-checked against the hard filters; swaps must be like-for-like and on-brief (422 `SWAP_NOT_ALLOWED`); primary changes lock the event row; removing the lead promotes the newest saved concept (P25); a new generation archives earlier unsaved drafts; tile scores are staff-only; consult is rate-limited 30/hour.
- **Questionnaire submit** generates the first concepts automatically (from the route, after the submit commits; a failure is logged, never returned).
- **Shared** (`packages/shared/src/moodboard/`): `deriveMoodboardDefaults` and helpers moved out of the webapp; `@elation/shared/api` gains the moodboard contracts.
- **Frontend**: `MoodboardViewer` rewritten on `webapp/src/data/moodboards.ts` (TanStack Query) — concept strip (crown = primary, star = saved, NEW = latest generation, ordered A→B→C), dnd-kit reorder, pin/lock, tile drawer with "why Elation chose this", alternatives with "Use this", "Ask my consultant". `MoodboardsPage`, `RecentMoodboards` and the event overview read the API. Mock mode keeps the fixture boards read-only.
- **Not yet**: LLM re-rank (v2, after launch), "Add to budget" (Step 8), Elation's sign-off on sample boards (❓ **Needs Elation**).
