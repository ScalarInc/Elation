# Step 8 review — Budget estimator + My Events → Budget journey

**Date:** 2026-10-13 · **Panel:** Backend Lead · Frontend Lead · Product/Elation Ops · DevOps · Security & Data
**Verdict:** ✅ Approved after fixes below.

## What was reviewed

- Shared: `packages/shared/src/budget/{categories,totals,seed}.ts`, `packages/shared/src/api/budget.ts`
- API: `server/src/modules/budget/{service,routes}.ts`; target write-through in the events and questionnaire services; `budgetForConsultantEmail`
- Webapp: `data/budget.ts`, `BudgetPage` (rewritten on the API with autosave), `BudgetListPage`, `EventDetailPage` budget tab + key numbers, `EventCard` budget chip, `QuickActions`, moodboard "Add to budget" / "Apply to budget"

## Evidence

| Check | Result |
| --- | --- |
| Shared tests (P8 boundaries, quantities for 50/320/800 guests, floor seating, fabric vs per-foot pieces, grouping, unpriced pieces skipped, fit-to-target, totals) | 17 budget tests pass (shared suite 62) |
| API tests (list every event; suggested target from the Q121 band; seed from recommendation / moodboard with a "price on request" report; PUT with version check + price snapshots + reprice; unpriced refused; duplicate pieces refused; target ↔ event budget both ways incl. stale-version 409; add-line creates the plan + no duplicates; apply moodboard; reset; quote freeze + dedupe + consultant email + changed-since-quote; send-to-consultant names the consultant; policy) | 13 pass (server suite 148) |
| Typecheck, lint, build | clean |
| Browser (Malaika) | `/budget` lists all 4 events incl. "Start budget"; estimator back link follows `?from=` (events / budget / dashboard / event); qty edit autosaves ("Saved") and survives navigation — including an edit made right before leaving; "Start from Elation's recommendation" lands on target (green); quote request → "Ayesha Malik will confirm…"; "Send to Ayesha Malik"; moodboard "Apply to budget" → "Added 3 pieces"; event cards show "PKR 40.7L of PKR 25.0L — Over budget"; no console errors |

## Findings

| # | Persona | Finding | Severity | Resolution |
| --- | --- | --- | --- | --- |
| 1 | Backend Lead | Changing the event budget (event edit or Q121) updated the plan target without bumping its version, so an open estimator could save its old target straight back. | High | **Fixed** — both paths bump the plan version; the open estimator gets 409 and reloads. Test added. |
| 2 | Frontend Lead | The "save on leave" bypassed the save in flight: stale version → 409, swallowed silently, edit lost. | High | **Fixed** — the flush waits for the save in flight, uses the version it returned, and tells the client if the change couldn't be saved. Browser-verified. |
| 3 | Product / Ops | A conflicting save replaced local edits with only "loaded the latest version". | Medium | **Fixed** — the message says the last change wasn't saved and why; nothing is overwritten (a consultant's edit wins over a stale tab). |
| 4 | Backend Lead | Two first "Add to budget" clicks at once raced on the one-plan-per-event constraint. | Medium | **Fixed** — add/apply upsert the plan; a concurrent "Start budget" is a 409 (`P2002` is already mapped). |
| 5 | Security | PUT accepted the same line id / piece twice (500 / double counting). | Medium | **Fixed** — zod refinements; 400. Test added. |
| 6 | Backend Lead | Apply-to-budget skipped the target write-through when nothing new was added to a fresh plan. | Medium | **Fixed** — write-through on every apply/add. |
| 7 | Security | The quote endpoint wasn't rate-limited (each request emails the consultant). | Medium | **Fixed** — shares the 20/hour hand-off limit. Repeats for an unchanged plan within 10 minutes already return the open request, which covers the Idempotency-Key intent without per-instance state. |
| 8 | DevOps | A mail failure after the quote committed returned 500, and the retry was deduped, so the consultant never heard. | Medium | **Fixed** — email failures are logged, not returned; the thread message and activity entry still carry the hand-off. An outbox/retry comes with Step 12's job runner. |
| 9 | Backend Lead | Reprice updated lines by id from a pre-read; a line removed meanwhile → 500. | Medium | **Fixed** — scoped `updateMany` inside the transaction, plus a version bump. |
| 10 | Product / Ops | Entrance pieces were seeded at 2; the spec says 1. | Low | **Fixed** (Q22 gates the entrance slot upstream in the engine). |
| 11 | Product / Ops | Per-foot florals at 2 ft/guest (spec) put a 140-guest starter at PKR 1.8 Cr with the demo canopy price. | Medium | **P29**: only Fabric scales with guests; other per-foot pieces start at one 40 ft run. The venue-length cap waits for structured venue dimensions (Q7 is free text). |
| 12 | Product / Ops | Starters from the recommendation landed far over target. | Medium | **P28**: starters fit the target by switching off the most expensive optional lines (never seating/tables); they stay visible to switch back on. |
| 13 | Frontend Lead | Category sections re-sorted by spend while typing. | Low | **Fixed** — fixed section order; the donut still sorts by spend. |
| 14 | Frontend Lead | Every autosave invalidated the whole events list. | Low | **Fixed** — autosaves that keep target/status only refresh the budget list. |
| 15 | Frontend Lead | Mock mode has no budget store (Part A's local persist store was overtaken by Part B). | Info | Accepted — mock mode shows the start screen and explains the estimator needs the server. |

## Decisions taken by the panel

- **P28 — Starter budgets land on target.** Seeding (recommendation, moodboard, reset) switches off the priciest optional lines until the total fits; seating and tables always stay on.
- **P29 — Per-foot quantities.** Fabric/draping: 2 ft per guest. Other per-foot or per-sqft pieces: one 40 ft feature run to start.
- **P30 — Budget hand-offs.** "Send to consultant" and "Request a quote" both move the plan to *submitted* (budget step complete); edits stay allowed and show "changed since your request". Quote requests freeze a snapshot for the consultant.
- **P31 — Unpriced pieces never enter a budget.** Seeds and "Apply to budget" report them as "priced on request" so the consultant can add them once Elation sets a price (follows P22).
