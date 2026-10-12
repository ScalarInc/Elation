# Step 5 review — Questionnaire API

**Date:** 2026-10-13 · **Panel:** Backend Lead · Frontend Lead · Product/Elation Ops · DevOps · Security & Data (personas from [00-decisions.md](../00-decisions.md#the-panel))
**Verdict:** ✅ Approved after fixes below.

## What was reviewed

- `packages/shared/src/questionnaire/` — full 134-question schema, branching, validation, `visibleAnswers`, `missingRequired`
- `server/src/modules/questionnaire/` — GET / PATCH (versioned) / submit / reopen / brief / revisions
- `webapp/src/questionnaire/store.ts` + `webapp/src/data/questionnaire.ts` — server-synced write-behind store
- `QuestionnairePage`, `EventDetailPage`, `NewEventDialog`, removal of the Step 4 interim overlay
- Data migration `20261013090000_questionnaire_v2_ids`

## Evidence

| Check | Result |
| --- | --- |
| Shared tests (schema has 134 sequential ids; every "No" gate hides its whole category; nested follow-ups; validation per kind) | 54 passed |
| Server tests (save/version/409, validation, write-through incl. budget-band rule, DRAFT→ACTIVE at 25 %, submit 422→200, reopen, brief hides hidden answers, revisions staff-only, scoping) | 95 passed |
| Webapp store tests (pending merge / apply rules) | 3 passed |
| Browser: edit two answers → one batched PATCH → "Saved just now" → reload shows them → event card guests updated; Submit with missing answers jumps to and highlights them | ✅ |
| Migration renames v1 keys correctly (psql, rolled-back transaction) | ✅ |

## Findings

| # | Persona | Finding | Severity | Resolution |
| --- | --- | --- | --- | --- |
| 1 | Frontend Lead | After every save the store invalidated all `['events']` queries, which also re-fetched the questionnaire it had just merged — one wasted GET per save. | Low | **Fixed** — invalidation skips the questionnaire key. |
| 2 | DevOps | Teammates' local databases hold answers under the five v1 ids; the renumbering would silently orphan them. | Medium | **Fixed** — data migration renames keys and sets `schemaVersion = 2` (verified with psql). |
| 3 | Backend Lead | The client-side conflict/merge logic (the riskiest frontend code in this step) had no tests; the webapp had no test runner. | Medium | **Fixed** — Vitest added to the webapp; `applyPending` / `mergePending` covered. |
| 4 | Product / Ops | Required-question hint said "or let Elation decide" on questions where that option doesn't exist (e.g. budget band). | Low | **Fixed** — hint depends on `question.elationDecides`. |
| 5 | Backend Lead | Soft-delete opt-out was being expressed inside `OR`, which the Prisma extension ignores (it only checks a top-level `deletedAt`). | Medium | **Fixed** — `deletedAt: {}` documented as the opt-out and used; verified with a probe. |
| 6 | Product / Ops | Demo client's Mehndi questionnaire dropped from "complete" to "in progress" once the full 134 questions existed. | Low | **Fixed** — seed marks fixture-complete questionnaires as *submitted*. |
| 7 | Security | Answer payloads: only known question ids accepted, option lists enforced, text capped (300 / 4 000 chars), uploads capped at 30 references; revisions (who changed what) visible to staff only; brief rendered as text. | — | No change needed. |
| 8 | Product / Ops | The structured **Design Brief** exists in the API (`/brief`) but has no screen yet. | Info | Deferred to Step 12 (admin client detail) and the event Overview; tracked in step-05 doc. |
| 9 | Backend Lead | Write-through reads the event row before the transaction; two simultaneous budget-band edits could compute the "previous midpoint" from a stale row. | Info | Accepted — single client editing their own budget; worst case the band doesn't move the budget, never data loss. |

## Decisions taken by the panel

- **P19 — Question ids = docx numbering.** Renumber the five drifting ids now (no production data yet) rather than carry two numbering schemes forever. Old keys migrated in SQL.
- **P20 — Write-behind store.** Answers apply locally instantly; one debounced PATCH per 600 ms carries every pending change with the last-seen `version`; on 409 the server copy is merged under local edits (latest local intent wins) and resent; 4xx validation errors drop the rejected batch and reload the server copy; network errors retry every 5 s; pending edits flush on tab hide and before leaving the page.
- **P21 — Hidden answers are kept, not deleted**, and every consumer reads through `visibleAnswers()`.
