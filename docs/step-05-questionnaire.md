# Step 5 — Questionnaire API

**Owners:** @Safwan (API) · @KnightX_O (wiring) · **Estimate:** 3 days · **Depends on:** Steps 2–4 (uploads need Step 11)

## Goal

Persist each event's questionnaire on the server — answers, "Elation decides" flags, progress, and history — with the branching rules enforced in one shared definition. Replace the Zustand `persist` → `localStorage` store as the source of truth.

## Current state

- `webapp/src/questionnaire/schema.ts` — 24 categories, **55 of the 134** questions from `ELATION questionnaire.docx`, `showIf` branching functions.
- `webapp/src/questionnaire/store.ts` — Zustand, persisted to `localStorage['elation.questionnaire']`, keyed by `eventId`; `setAnswer`, `toggleAnswer`, `setElationDecides`, `clearAnswer`, progress math.
- `webapp/src/mocks/questionnaireSeed.ts` + `hydrate.ts` — seeds answers for the fixture events at boot.
- `q8_upload` / `q13` uploads are mock dropzones.

## Design

### Shared definition (moved in Step 1)

`packages/shared/src/questionnaire/`:

- `schema.ts` — categories + questions + `showIf`. **Complete the remaining 79 questions** from the docx (owner: @KnightX_O for UI kinds, @Safwan for review). Every question needs a stable `id` (`q<number>_<slug>`), never renamed once shipped.
- `SCHEMA_VERSION` constant; bump on any change to ids/options.
- `answerSchemaFor(question)` → zod schema per kind:
  | kind | zod |
  | --- | --- |
  | `single` | `z.enum(options)` (plus free text when the option is `Other` → `{ value: 'Other', other: string }`) |
  | `multi` | `z.array(z.enum(options)).max(question.maxSelect ?? options.length)` |
  | `text` / `textarea` | `z.string().max(200 / 4000)` |
  | `number` | `z.number().int().positive()` |
  | `date` | ISO date string |
  | `dimensions` | `{ width?: number, depth?: number, height?: number, unit: 'ft' \| 'm' }` |
  | `color` | `{ desc?: string, hex?: string[] /^#[0-9a-f]{6}$/i }` |
  | `upload` | `string[]` of `File.id` (status READY, owned by this event) |
  | `range-select` | `z.enum(options)` |
- `visibleQuestions(answers)`, `computeCategoryProgress`, `computeOverallPercent`, `isAnswered` — pure, used on both sides.

### Server behaviour

- **Hidden answers are kept, not deleted.** If the client switches Q46 "ceiling décor" to *No*, answers to Q47–50 stay in the JSON (so switching back restores them) but are excluded from progress, the brief, moodboard curation and analytics. All consumers call `visibleAnswers(answers)` from shared.
- **"Elation decides"** sets `elationDecides[qid] = true` and removes `answers[qid]`; setting an answer clears the flag (same semantics as today's store). Only allowed on questions with `elationDecides: true`.
- **Write-through** of event basics (Step 4 table) in the same transaction.
- **Progress** recomputed on each write and cached in `percentComplete`.
- **Revision row** per save with `[{ qid, from, to }]`.
- **Activity**: debounced — at most one "Questionnaire updated — Colour Palette, Stage" entry per event per 30 minutes; one "Questionnaire submitted" on submit.

## Endpoints

| Method | Path | Body → Response |
| --- | --- | --- |
| `GET` | `/events/:id/questionnaire` | → `{ schemaVersion, answers, elationDecides, percentComplete, categories: CategoryProgress[], submittedAt, version, updatedAt }` |
| `PATCH` | `/events/:id/questionnaire` | `{ version, set?: Record<qid, unknown>, decides?: Record<qid, boolean>, clear?: qid[] }` → same as GET. Batches several field changes (the UI debounces 600 ms). 409 `VERSION_CONFLICT` returns the current doc |
| `POST` | `/events/:id/questionnaire/submit` | Validates all *required visible* questions are answered or decided → sets `submittedAt`, triggers first moodboard generation (Step 7), activity + system message to consultant. 422 `QUESTIONNAIRE_INCOMPLETE` with missing qids |
| `POST` | `/events/:id/questionnaire/reopen` | Clears `submittedAt` (edits after submit are allowed, but consultant sees "changed after submit") |
| `GET` | `/events/:id/questionnaire/brief` | Structured "Design Brief" (category → visible answered questions with labels), used by the final step and the admin client page |
| `GET` | `/events/:id/questionnaire/brief.pdf` | PDF render of the brief (Phase 2; server-side via `@react-pdf/renderer`) |
| `GET` | `/events/:id/questionnaire/revisions?cursor=` | Consultant/admin only — change history |

### Conflict handling

Two tabs (or client + consultant) editing at once: `PATCH` with a stale `version` → 409 with the server doc. The frontend merges: server values win for questions the user didn't touch in the pending batch; the pending batch is re-sent with the new version. If the same question changed on both sides, the local edit wins (it's the most recent intent) and a toast says "Updated from another session".

## Frontend changes (@KnightX_O)

| File | Change |
| --- | --- |
| `questionnaire/store.ts` | Becomes a thin **pending-changes buffer** over TanStack Query: `useQuestionnaire(eventId)` returns server data merged with unsent local edits; edits are debounced 600 ms into one `PATCH`. Drop `persist` (or keep it only as an offline draft cache keyed by `eventId+version`) |
| `pages/QuestionnairePage.tsx` | Saving indicator: "Saving…" / "Saved · 2s ago" / "Offline — will retry". Replace "Progress saved" toast with the indicator. Final step calls `/submit`, shows missing-question list on 422 |
| `questionnaire/QuestionField.tsx` | `upload` kind uses the Step 11 upload hook; stores `File.id`s |
| `mocks/hydrate.ts`, `questionnaireSeed.ts` | Used only in `mock` API mode; the server seed (Step 2) owns this data in `http` mode |
| `pages/EventDetailPage.tsx` → `QuestionnaireSummary` | Reads `categories` progress from the API |

## Tests

- Shared: every question's `showIf` against fixture answers; progress math (hidden questions excluded; category fully hidden).
- Server: invalid option → 400 with the qid; `decides` on a question without `elationDecides` → 400; version conflict → 409; write-through updates Event; submit with missing required → 422 listing qids; hidden answers excluded from brief.

## Definition of done

- [ ] All 134 questions from the docx exist in `packages/shared` with correct options and branching (checked against the docx's "Implementation Notes for IT Team").
- [ ] Answers persist across devices/browsers for the same client.
- [ ] Consultant opening the same event sees the client's latest answers and the revision history.
- [ ] Progress % is identical on the questionnaire page, dashboard, event card and admin.
- [ ] Submitting the questionnaire produces the first moodboard concepts (once Step 7 lands).
