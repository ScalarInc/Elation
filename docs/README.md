# Elation X — Backend Plan

This folder is the plan for building the Elation X backend and wiring the existing frontend to it. Each step is one Markdown file with scope, data model, endpoints, frontend changes, owners, and a definition of done. Work through them in order; the dependency graph below shows what can run in parallel.

## Read first

| File | What it covers |
| --- | --- |
| [00-decisions.md](00-decisions.md) | The decision panel, and every architecture decision with its reasoning (ADR log) |
| [01-architecture.md](01-architecture.md) | System overview, folder layout, API conventions, auth model, realtime, jobs |

## Steps

| # | Step | Main owner | Unblocks |
| --- | --- | --- | --- |
| 1 | [Foundation: monorepo, server scaffold, local DB, CI](step-01-foundation.md) | @Safwan | everything |
| 2 | [Database schema](step-02-database.md) — Users, Events, Questionnaires, Chat, Budget, Moodboard, Inventory | @Safwan | 3–12 |
| 3 | [Auth & access control](step-03-auth.md) — invite-only accounts with expiry, sessions, roles | @Safwan | 4–12 |
| 4 | [Events API + remove hard-coded events](step-04-events.md) | @Safwan (API), @KnightX_O (UI) | 5, 7, 8 |
| 5 | [Questionnaire API](step-05-questionnaire.md) | @Safwan (API), @KnightX_O (UI) | 7, 8 |
| 6 | [Inventory catalogue](step-06-inventory.md) | @Safwan | 7, 8 |
| 7 | [Moodboard backend](step-07-moodboard.md) — curation engine, concepts, tiles | @Safwan | 9 (adopt) |
| 8 | [Budget estimator + My Events → Budget journey](step-08-budget.md) | @KnightX_O (journey), @Safwan (API) | 12 |
| 9 | [Inspirations & AR sets](step-09-inspirations-ar.md) | @Safwan | — |
| 10 | [Chat history, realtime & activity feed](step-10-chat-activity.md) | @Safwan | 12 |
| 11 | [Files & uploads (R2)](step-11-files.md) | @Safwan | 5 (uploads), 10 (attachments) |
| 12 | [Admin & consultant API](step-12-admin.md) | @Safwan (API), @KnightX_O (UI) | — |
| 13 | [Frontend integration playbook](step-13-frontend-integration.md) | @KnightX_O | runs alongside 4–12 |
| 14 | [Deployment, security & operations](step-14-deploy-ops.md) | @Safwan | launch |

## Current priority items → where they live

| Priority item | Owner(s) | Step(s) |
| --- | --- | --- |
| **Events** — remove hard-coded events, make them dynamic | @KnightX_O (FE), @Safwan (BE) | [4](step-04-events.md), [13](step-13-frontend-integration.md) |
| **Moodboard backend** | @Safwan | [7](step-07-moodboard.md) (needs [6](step-06-inventory.md)) |
| **Database** — Users, Events, Questionnaires, Chat History, Budget | @Safwan | [2](step-02-database.md) |
| **Budget Estimator** — fix My Events → Budget Estimator journey | @KnightX_O | [8](step-08-budget.md) — Part A can start today with no backend |

## Dependency graph

```
 Step 1 Foundation
     │
 Step 2 Database ─────────────┐
     │                        │
 Step 3 Auth                  │
     │                        │
     ├── Step 4 Events ──┬── Step 5 Questionnaire ──┐
     │                   │                          │
     ├── Step 6 Inventory┴──────────────────────────┼── Step 7 Moodboard ── Step 9 Inspirations/AR
     │                                              │
     │                                              └── Step 8 Budget
     ├── Step 11 Files ── Step 10 Chat/Activity
     │
     └── Step 12 Admin (after 4–10)

 Step 13 Frontend integration: page-by-page, as each API lands
 Step 14 Deploy/ops: staging from Step 3 onward, production at the end
```

## Suggested timeline (2 people)

| Week | @Safwan (backend) | @KnightX_O (frontend) |
| --- | --- | --- |
| 1 | Steps 1–3 | Step 8 Part A (journey fix on mocks), Step 13 setup (TanStack Query, `api` HTTP mode, Vite proxy) |
| 2 | Steps 4, 5, 6 | Step 4 frontend (dynamic events), auth pages wired |
| 3 | Steps 7, 8 API | Questionnaire + budget wiring |
| 4 | Steps 10, 11, 9 | Moodboard + messages wiring |
| 5 | Step 12 | Admin pages |
| 6 | Step 14, hardening | QA, dark-mode/empty-state pass |

## How to use these docs

- All work happens on the **`feature/backend`** branch, committed and pushed after every step; merged into `main` when done.

- Each step ends with a **Definition of done** checklist. Tick it in the PR description that closes the step.
- If implementation deviates from a doc, update the doc in the same PR and add a line to the deviation log in [00-decisions.md](00-decisions.md).
- Open questions that need Elation (the client) are marked **❓ Needs Elation** — collect them for the next client call.
