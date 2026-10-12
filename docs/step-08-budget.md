# Step 8 — Budget estimator + My Events → Budget Estimator journey

**Owners:** @KnightX_O (journey, Part A) · @Safwan (API, Part B) · **Estimate:** Part A 2 days, Part B 3 days · **Depends on:** Part A — nothing; Part B — Steps 4, 6 (seeding from moodboards needs Step 7)

> Priority item: *"Budget Estimator: Fix the user journey from My Events → Budget Estimator."*
> Spec: *"…generates an initial estimated cost for the recommended setup. Clients can then customize the setup by adding optional inventory-based add-ons or removing selected elements, with the estimated total updating dynamically in real time. A colour-coded indicator will show whether the updated configuration is on budget (green), under budget (yellow), or over budget (red)."*

## The journey today (broken)

```
My Events ──click card──▶ Event Detail (Overview)
                              │  "Budget" module card → ?tab=budget   (not the estimator)
                              ▼
                          Budget tab = a hand-off card ──"Open the estimator"──▶ /events/:id/budget
                                                                                   │
                     no fixture snapshot? → empty state → "Start planning" ──────▶ generic seed
                                                                                   │ (always 100 gold chairs, ignores
                                                                                   │  event type, guests, moodboard)
                                                                                   ▼
                                                                        edits live in useState only
                                                                        → leave the page = all changes lost
```

Concrete defects:

| # | Where | Defect |
| --- | --- | --- |
| J1 | `EventCard.tsx` | Only links to event detail. No way to jump to the budget from My Events |
| J2 | `EventDetailPage.tsx` (`MODULES.budget.href`) | Overview module card goes to `?tab=budget`, which is just another hand-off card — two hops to reach the estimator |
| J3 | `BudgetListPage.tsx` | Lists only events that have a fixture snapshot; new events never appear, so `/budget` (sidebar "Budget Estimator") is a dead end with "Go to My Events" |
| J4 | `BudgetPage.tsx` | Edits (qty, include, add, remove, target) are `useState` only — lost on navigation, no save, no unsaved-changes warning |
| J5 | `BudgetPage.tsx` `seedLinesFromEventType()` | Ignores event type, guest count, moodboard; toast claims "seeded … from your answers" |
| J6 | `BudgetPage.tsx` back link | Always returns to the event, even when the user came from `/budget` or the dashboard |
| J7 | `BudgetPage.tsx` `sendToConsultant()` | Hard-coded "Sent to Ayesha" |
| J8 | `classifyBudget()` | Yellow is used for slightly *over* budget; spec says yellow = under, red = over ([P8](00-decisions.md#p8-budget-traffic-light--follow-the-spec-thresholds-in-one-shared-constant)) |
| J9 | `BudgetListPage` vs `BudgetPage` vs `EventDetailPage` | Three different places compute totals/tones with their own code |
| J10 | `BudgetListPage` | Effect loads once with `[]` deps — events created later in the session don't show until reload |

## Target journey

```
My Events ─┬─ card click ───────────────▶ Event Detail ── Budget module card ──▶ /events/:id/budget
           └─ card quick action "Budget" ─────────────────────────────────────▶ /events/:id/budget?from=events

/budget (sidebar) ── every event listed:
     has plan → traffic-light card ──────────────────────────────────────────▶ /events/:id/budget?from=budget
     no plan  → "Start budget" card ─────────────────────────────────────────▶ /events/:id/budget?from=budget

/events/:id/budget, no plan yet:
     "Start from my moodboard" (if a primary/saved concept exists)
     "Start from Elation's recommendation" (rules seed using type + guests + questionnaire)
     "Start blank"
  → plan saved immediately → edits autosave (debounced) → "Saved" indicator
  → back button returns to `from` (events | budget | dashboard | event)
```

## Part A — frontend journey fix (@KnightX_O, no backend needed)

Runs on the mock API; Part B swaps the data source without touching these flows.

1. **Shared budget math** — move `classifyBudget`, `groupByCategory`, totals into `packages/shared/src/budget/` (or `webapp/src/lib/budget.ts` until Step 1 lands). Use P8 thresholds. `BudgetPage`, `BudgetListPage`, `EventDetailPage`, `EventCard` all import it (J8, J9).
2. **EventCard** — add a footer row with a budget chip (traffic-light dot + "PKR 2.3M of 2.5M" or "No budget yet") and a hover quick-action menu including **Budget** → `/events/:id/budget?from=events` (J1).
3. **EventDetailPage** — `MODULES.budget.href` → `/events/:id/budget?from=event`; the Budget tab renders an inline summary (light, total, delta, top 3 categories) with "Open the estimator" (J2).
4. **BudgetListPage** — iterate over **all** events (`useEvents()`); events without a plan render a "Start budget" card; react to event list changes (J3, J10).
5. **Mock persistence** — a `budget` mock store (Zustand + `persist`, keyed by `eventId`) behind `api.budget.get/save/create`, so edits survive navigation today. Autosave 800 ms after the last change with a "Saving… / Saved" indicator; `useBlocker` warns if leaving with an unsaved change in flight (J4).
6. **Better seeding** — `seedBudgetLines({ event, answers, inventory, moodboard? })` in shared (rules below) replaces `seedLinesFromEventType()`. Empty state offers the three start options (J5).
7. **Back navigation** — read `?from=`; label and target accordingly; default to event detail (J6).
8. **Consultant name** from `me.consultant.name` (J7).
9. **Moodboard tile "Add to budget"** (Step 7) calls `api.budget.addLine` — creates the plan if missing.

### Seeding rules (shared)

| Line | Quantity rule |
| --- | --- |
| Seating chairs | `guests` (or `guests − floor-seating capacity` if Q56 = Yes) |
| Dining tables (10-seat round) | `ceil(guests / 10)` if Q61 = Yes |
| Centrepieces, candle clusters | `= tables` |
| Stage backdrop / sofa / props | 1 / 1–2 / 1 if Q29 = Yes |
| Chandeliers | 1 per 150 guests (min 1) if Q46 = Yes and Q84 ≠ No |
| Ceiling fabric / floral canopy (linear ft) | 2 ft per guest, capped at venue length if Q7 dimensions given |
| Entrance pieces | 1 each if Q22 = Yes |

Item choice: tiles of the primary (else most recent saved) moodboard; otherwise concept A of a fresh rules-engine run (Step 7) without persisting a moodboard.

## Part B — API (@Safwan)

### DTO

```ts
type BudgetPlanDto = {
  id: string
  eventId: string
  targetPkr: number
  status: 'draft' | 'submitted' | 'quoted'
  seededFrom: 'rules' | 'moodboard' | 'inspiration' | 'blank' | 'fixture'
  version: number
  lines: {
    id: string; category: string; qty: number; included: boolean; position: number
    unitPricePkr: number            // snapshot
    currentPricePkr: number         // live inventory price — differs ⇒ "prices updated" banner
    item: InventoryItemDto
  }[]
  totals: { includedPkr: number; byCategory: { category: string; totalPkr: number; count: number }[] }
  classification: { state: 'green' | 'yellow' | 'red'; ratio: number; deltaPkr: number }
  pricesChanged: boolean
  updatedAt: string
}
```

Totals and classification are computed with the same shared functions the UI uses; the UI recomputes live while editing and the server's numbers win after save.

**Single source of truth for the target:** `BudgetPlan.targetPkr` writes through to `Event.budgetPkr` (same transaction), so the event card, dashboard and estimator never disagree.

### Endpoints

| Method | Path | Body → Response |
| --- | --- | --- |
| `GET` | `/budgets` | One row per event the user can see: `{ event: EventSummary, plan: { totals, classification, status } \| null }` — feeds `/budget` |
| `GET` | `/events/:id/budget` | `{ plan: BudgetPlanDto \| null, suggestedTargetPkr }` (200 even when no plan → simpler UI) |
| `POST` | `/events/:id/budget` | `{ seedFrom: 'moodboard' \| 'rules' \| 'blank', moodboardId?, targetPkr? }` → 201 plan. 409 if a plan exists |
| `PUT` | `/events/:id/budget` | `{ version, targetPkr, lines: [{ id?, inventoryItemId, category, qty, included, position }] }` → plan. Full replace — matches the UI's local-edit-then-save model. New lines get the current price snapshot; existing lines keep theirs. 409 `VERSION_CONFLICT` |
| `POST` | `/events/:id/budget/lines` | `{ inventoryItemId, category?, qty?, source }` → plan. Creates a blank plan if none (moodboard "Add to budget") |
| `POST` | `/events/:id/budget/reset` | Re-seed with the original `seededFrom` ("Reset to Elation defaults") |
| `POST` | `/events/:id/budget/reprice` | Update all snapshots to current prices |
| `POST` | `/events/:id/budget/send-to-consultant` | `{ note? }` → system message in the event thread with a summary card |
| `POST` | `/events/:id/budget/quote` | `{ note? }` + `Idempotency-Key` → creates `QuoteRequest` with frozen snapshot, plan → `submitted`, email + system message to consultant, activity entry. Further edits are allowed but show "changed since quote request" |
| `GET` | `/events/:id/budget/quotes` | quote history |

Validation: `qty` 1–10 000; `inventoryItemId` must be active (archived items already in a plan stay but show "no longer available"); max 200 lines.

## Tests

- Shared: classification boundaries (0.849, 0.85, 1.02, 1.021); seeding quantities for 50/320/800 guests; Q-gates respected.
- API: create/put/version conflict; target write-through to event; price snapshot kept on PUT; reprice; quote idempotency; policy matrix.
- E2E (Playwright, Step 14): My Events → card "Budget" → start from recommendation → change qty → navigate away and back → change persists → traffic light updates.

## Definition of done

- [x] From My Events, the estimator is one click away (card quick action) and two at most (card → module card).
- [x] `/budget` lists every event, with or without a plan.
- [x] Budget edits survive navigation and reload (mock store in Part A, server in Part B).
- [x] Starter budget reflects event type, guest count and the chosen moodboard.
- [x] Traffic light follows the spec (green on, yellow under, red over) everywhere it appears.
- [x] "Request a quote" creates a real quote request that the consultant sees in admin. *(stored + emailed + thread message now; admin inbox screen in Step 12)*

## As built (2026-10-13)

- **Shared** (`packages/shared/src/budget/`): `BUDGET_CATEGORIES` + `budgetCategoryFor` (florals/seating/tables/lights by kind, the rest by area), `budgetTotals`, `seedQuantity` (rules above, with P29 for per-foot pieces), `seedBudgetLines` (skips unpriced pieces, P31), `fitToTarget` (P28). `classifyBudget` (P8) is used by the server, the estimator, the budget list, the event tab and the event cards.
- **API** (`server/src/modules/budget/`): every endpoint in the table, plus `POST /moodboards/:id/apply-to-budget` (Step 7's deferred endpoint). PUT is a full replace guarded by `version` (atomic `updateMany … where version`); new lines snapshot today's price, existing lines keep theirs (P7); `pricesChanged` / reprice; `changedSinceQuote` compares against the frozen quote snapshot. Target ↔ `Event.budgetPkr` written through in both directions, with a version bump when the event side changes. Hand-offs write an activity entry, a SYSTEM message in the client's thread (if one exists — Step 10 owns threads) and email the consultant; 20/hour per user.
- **"Elation's recommendation"** = one rules-engine concept (Step 7) restricted to priced pieces, not persisted, plus chairs and tables for every guest unless dining is declined.
- **Webapp**: `BudgetPage` keeps a local draft and autosaves 800 ms after the last edit (one save at a time, version-chained; "Saving… / Saved"), flushes on leave and warns on tab close; the start screen offers moodboard / recommendation / blank; the back link follows `?from=` (events, budget, dashboard, event); consultant name from `/me`; the picker shows unpriced pieces as "Price on request" (disabled). `/budget` lists every event (`GET /budgets`). The event tab shows the live summary; key numbers show the estimate; event cards show a traffic-light chip; the card menu and dashboard quick action link straight to the estimator.
- **Deviations**: mock mode has no budget store (Part A's persist store was superseded by the API); thresholds use `DEFAULT_BUDGET_THRESHOLDS` until the admin settings screen (Step 12); the venue-length cap for fabric waits for structured dimensions. Review: [step-08-review.md](reviews/step-08-review.md).
