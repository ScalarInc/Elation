# Step 4 — Events API + remove hard-coded events

**Owners:** @Safwan (backend) · @KnightX_O (frontend) · **Estimate:** 3 days · **Depends on:** Steps 2, 3

> Priority item: *"Events: Remove hard-coded events and make them dynamic as per requirements."*

## Problem today

Events are a static array in `webapp/src/mocks/fixtures.ts`. Specific symptoms:

| Where | Problem |
| --- | --- |
| `components/NewEventDialog.tsx` | `events.push({...})` mutates the fixture array — the new event is gone on refresh, has a hard-coded `budgetPKR: 2_000_000`, `indoor: 'Both'`, fixed cover image |
| `components/CountdownCard.tsx`, `NextStepCard.tsx`, `ProgressOverview.tsx`, `QuickActions.tsx`, `YourEventCard.tsx`, `RecentMoodboards.tsx` | Import `events` directly and mostly use `events[0]` as "the" event |
| `questionnaire/derived.ts` | `useResolvedEvent(s)` overlays questionnaire answers onto fixtures at render time — two sources of truth |
| `pages/MoodboardsPage.tsx`, `InspirationDetailPage.tsx`, `InspirationsPage.tsx` | Read `events` for pickers ("adopt into which event?") |
| `EventCard` / `MyEventsPage` | Status (`draft/active/past`) and `progress` are hand-written fixture values |
| no route | Duplicate / Archive quick actions described in `PLAN.md` §4b don't exist |

## Rules (from the spec and decisions)

- An event belongs to exactly one client. Consultants see their clients' events; admins see all.
- A wedding is usually several events (Mehndi, Baraat, Walima, Nikkah) — the list must handle many.
- Event basics are columns; the questionnaire writes through to them ([P3](00-decisions.md#p3-single-source-of-truth-for-event-basics--event-columns-with-write-through-from-the-questionnaire)).
- `progress` and the "past" status are computed ([P6](00-decisions.md#p6-event-progress-and-status-are-computed-not-stored)).

## Event DTO (`@elation/shared/api/events.ts`)

Kept close to today's `ClientEvent` so components change little:

```ts
type EventDto = {
  id: string
  clientId: string
  name: string
  concept: string | null
  type: EventType              // 'Mehndi' | 'Baraat' | … (display form; enum mapped at the edge)
  date: string | null          // 'YYYY-MM-DD'
  venue: { name: string | null; city: string | null; indoor: 'Indoor' | 'Outdoor' | 'Both' | null }
  guests: number | null
  budgetPKR: number | null
  coverImage: string           // resolved URL (uploaded cover → presigned/public URL, else stock by type)
  status: 'draft' | 'active' | 'past' | 'archived'
  progress: { questionnaire: ModuleStatus; moodboard: ModuleStatus; budget: ModuleStatus; ar: ModuleStatus }
  questionnairePercent: number
  nextStep: { title: string; body: string; href: string }
  createdAt: string
  updatedAt: string
}
```

### Derivations (shared, pure, unit-tested)

```ts
// packages/shared/src/events/progress.ts
questionnaire: percent === 0 ? 'pending' : percent === 100 || submittedAt ? 'complete' : 'in_progress'
moodboard:     no moodboards ? 'pending' : any SAVED && isPrimary ? 'complete' : 'in_progress'
budget:        no plan ? 'pending' : plan.status !== 'DRAFT' ? 'complete' : 'in_progress'
ar:            no ARSet ? 'pending' : READY ? 'complete' : 'in_progress'

status:        archived ? 'archived' : date && date < today ? 'past' : stored === 'DRAFT' ? 'draft' : 'active'
               // DRAFT → ACTIVE automatically when the questionnaire passes 25 %

nextStep:      first module not 'complete', in order questionnaire → moodboard → budget → ar
               → { title, body, href } (replaces the hard-coded logic in NextStepCard)
```

## Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/events?status=&sort=date_asc\|date_desc\|name&clientId=` | Client: own events. Consultant/admin: `clientId` required or returns their scope. Returns `EventDto[]` (small list, no pagination for clients) |
| `POST` | `/events` | Body = NewEventDialog fields: `{ type, concept, date, guests, venueName, city, venueSetting?, budgetPkr? }`. Creates `Event(DRAFT)` **and** an empty `QuestionnaireResponse` pre-filled with `q1_type, q2_name, q3_date, q4_guests, q5_venue, q6_indoor` so the questionnaire opens already answered. Writes activity "Event created". → 201 `EventDto` |
| `GET` | `/events/:id` | `EventDto` |
| `PATCH` | `/events/:id` | Partial basics; writes back to the matching questionnaire answers in the same transaction |
| `POST` | `/events/:id/duplicate` | Copies basics + questionnaire answers (not moodboards/budget) → new DRAFT |
| `POST` | `/events/:id/archive` / `unarchive` | |
| `DELETE` | `/events/:id` | Soft delete; only DRAFT events with no budget submission; else 422 `EVENT_NOT_DELETABLE` |
| `PUT` | `/events/:id/cover` | `{ fileId }` from the files module (Step 11) |

### Write-through mapping

| Question | Event column | Transform |
| --- | --- | --- |
| `q1_type` | `type` | display string ↔ enum |
| `q2_name` | `concept` (and `name` if name was auto-generated) | trim; empty → null |
| `q3_date` | `date` | ISO date |
| `q4_guests` | `guests` | positive int |
| `q5_venue` | `venueName` | trim |
| `q6_indoor` | `venueSetting` | `Indoor/Outdoor/Both` ↔ enum |
| `q121_budget` | `budgetBand`, and `budgetPkr` **only if** the client never set an explicit number | band midpoint (table in `shared/budget/bands.ts`, moved from `derived.ts`) |

## Frontend changes (@KnightX_O)

Do these in order; each is a small PR. Until Step 13's HTTP mode is on, the mock implementation of the new hooks reads fixtures, so nothing breaks.

1. **Introduce hooks** in `webapp/src/data/events.ts`:
   `useEvents(filter?)`, `useEvent(id)`, `useCreateEvent()`, `useUpdateEvent()`, `useDuplicateEvent()`, `useArchiveEvent()`, and `usePrimaryEvent()` = soonest upcoming non-archived event (replaces every `events[0]`).
2. **Replace direct imports** — no file outside `src/mocks` may import `events`:
   - `CountdownCard`, `NextStepCard`, `ProgressOverview`, `QuickActions`, `YourEventCard` → `usePrimaryEvent()`; `NextStepCard` renders `event.nextStep`.
   - `RecentMoodboards`, `MoodboardsPage`, `InspirationsPage`, `InspirationDetailPage` → `useEvents()`.
3. **NewEventDialog** → `useCreateEvent().mutateAsync(values)`; add venue setting (Indoor/Outdoor/Both) and optional budget field; navigate to `/events/:id/questionnaire` (the questionnaire is the natural next step) and invalidate `['events']`.
4. **Delete** `useResolvedEvent`, `useResolvedEvents`, `resolveEvent`, `BUDGET_MIDPOINTS` from `questionnaire/derived.ts` (keep the moodboard derivations). Questionnaire saves invalidate `['events', id]`, so pages refresh with the written-through values.
5. **EventCard** quick actions (hover menu): View · Questionnaire · Moodboard · **Budget** · Duplicate · Archive.
6. **MyEventsPage**: filters use server `status`; add an "Archived" chip; skeleton while loading; error state with retry.
7. Add a lint guard (oxlint `no-restricted-imports`) forbidding `@/mocks/fixtures` outside `src/mocks` and `src/lib/api.mock.ts`.

## Tests

- Service: create → questionnaire pre-filled; PATCH date → `q3_date` updated; questionnaire `q4_guests` save → `guests` updated; duplicate copies answers but not plan; status derivation for past/draft/archived.
- Policy matrix (Step 3) for every route.
- Frontend: creating an event, refreshing the page, and seeing it still in My Events.

## Definition of done

- [x] No component imports `events` from `@/mocks/fixtures` — enforced by an oxlint `no-restricted-imports` rule (only `data/events.ts` may, for `VITE_API_MODE=mock`). Other fixture data (moodboards, budgets, inventory, messages) is still imported until Steps 6–10.
- [x] Creating an event survives a refresh and appears on Dashboard, My Events, Budget overview, and inspiration "adopt" pickers.
- [x] Changing guest count in the questionnaire updates the event card without a manual refresh — via the interim local overlay (below); server-side write-through from the questionnaire lands in Step 5.
- [x] Event progress bars and status pills come from the API, not fixtures.
- [x] Duplicate and Archive work from the event card (plus Delete for drafts, and a Budget shortcut — journey item J1 of Step 8).

## As built (2026-10-12)

| Area | Where |
| --- | --- |
| Contracts | `packages/shared/src/api/events.ts` |
| Progress / status / next-step derivation (pure, tested) | `packages/shared/src/events/progress.ts` |
| Service + routes | `server/src/modules/events/*` |
| Event → questionnaire write-through (q1–q6 + revision row) | `syncBasicsToQuestionnaire` in the events service |
| Webapp hooks (HTTP + mock mode) | `webapp/src/data/events.ts` |

Notes:

- **Required at creation:** date, venue name, city, indoor/outdoor and guests. The DTO's `date` is therefore always a `YYYY-MM-DD` string; `budgetPKR` is `null` until set ("Budget not set" in the UI).
- **"Past"** is computed in Pakistan time (`Asia/Karachi`) so an event doesn't flip to past at 5 am local.
- **Mock fixtures share IDs with the server seed:** `webapp/src/mocks` events use the same deterministic UUIDs as `server/prisma/seed`, so mock-backed pages (moodboards, budget, AR, activity) keep lining up with real events until their steps land. Mock moodboards/activity are filtered to the signed-in client's events, so a new client sees empty states instead of the demo client's data.
- **Interim overlay:** `useResolvedEvent(s)` still overlays local (not-yet-server) questionnaire answers onto API events. A questionnaire budget band only fills a *missing* budget, matching the server rule. The overlay is removed in Step 5.
- `PUT /events/:id/cover` waits for file uploads (Step 11).
