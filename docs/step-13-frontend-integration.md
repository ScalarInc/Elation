# Step 13 — Frontend integration playbook

**Owner:** @KnightX_O · **Reviewer:** @Safwan · **Runs alongside Steps 3–12** · **Depends on:** Step 1

## Goal

Move every page from `src/mocks` to the real API **one page at a time**, without a big-bang switch and without breaking the mock-driven demo while the backend is still being built ([P13](00-decisions.md#p13-frontend-data-fetching--tanstack-query-migrated-page-by-page-behind-vite_api_mode)).

## 13.1 Setup (week 1)

1. Add `@tanstack/react-query` (+ devtools in dev). Wrap `<App>` in `QueryClientProvider` (`staleTime: 30s`, `retry: 1`, no retry on 4xx).
2. Split `src/lib/api.ts`:
   ```
   src/lib/api/
     index.ts        export const api = import.meta.env.VITE_API_MODE === 'http' ? httpApi : mockApi
     mock.ts         today's setTimeout implementation (+ the new mock stores for budget, events)
     http.ts         fetch-based implementation
     client.ts       fetch wrapper: base '/api/v1', credentials 'include', JSON, error → ApiError(code, status)
   ```
   Both implementations satisfy one `Api` interface whose types come from `@elation/shared/api`. A missing method in either is a type error.
3. `src/data/<domain>.ts` — query hooks, one file per domain: `useMe`, `useEvents`, `useEvent`, `useQuestionnaire`, `useMoodboards`, `useBudget`, `useInventory`, `useInspirations`, `useThreads`, `useActivity`, … Pages call hooks, **never** `api.*` in `useEffect`.
4. Query keys convention: `['events']`, `['events', id]`, `['events', id, 'questionnaire']`, `['events', id, 'moodboards']`, `['events', id, 'budget']`, `['inventory', filters]`, `['threads']`, `['threads', id, 'messages']`.
5. Global error handling in `client.ts`: 401 → `/auth`, 403 `ACCESS_EXPIRED` → `/access-ended`, 5xx → toast "Something went wrong — retry" (inline retry on the section, per `PLAN.md` §7).
6. `.env.development`: `VITE_API_MODE=mock` until Step 3 is deployed to staging; then `http`.

## 13.2 Types

- `src/mocks/types.ts` re-exports from `@elation/shared` during migration, then is deleted.
- Enum display mapping (`'Corporate Event'` ↔ `CORPORATE_EVENT`) happens in the server DTO layer; the frontend keeps display strings.

## 13.3 Migration order and checklist

| # | Page / component | Hooks | Removes | Backend step |
| --- | --- | --- | --- | --- |
| 1 | `ProtectedRoute`, `AuthPage`, `ClientLayout` user menu, `ConsentGate` | `useMe`, login/logout mutations | `currentUser`, `elation-auth` stub | 3 |
| 2 | `ProfilePage`, `SettingsPage` | `useMe`, profile/notification/password mutations | `currentUser` | 3 |
| 3 | `MyEventsPage`, `EventCard`, `NewEventDialog` | `useEvents`, `useCreateEvent` | `events.push`, `useResolvedEvents` | 4 |
| 4 | Dashboard: `YourEventCard`, `CountdownCard`, `NextStepCard`, `ProgressOverview`, `QuickActions` | `usePrimaryEvent` | `events[0]` | 4 |
| 5 | `EventDetailPage` | `useEvent`, module summaries | `moodboards`, `budgets`, `messages` imports | 4 |
| 6 | `QuestionnairePage`, `QuestionField`, `CategoryRail` | `useQuestionnaire` (buffered PATCH) | `persist` store, `hydrate.ts` | 5 |
| 7 | Budget: `BudgetListPage`, `BudgetPage` | `useBudgets`, `useBudget`, save mutation | mock budget store | 8 |
| 8 | `MoodboardViewer`, `MoodboardsPage`, `RecentMoodboards` | `useMoodboards`, generate/save/like mutations | `moodboards`, `inventory` imports, `makeVariants`, `tileItem` | 7 |
| 9 | `InspirationsPage`, `InspirationDetailPage` | `useInspirations`, `useAdopt` | toast-only adopt | 9 |
| 10 | `ARPage`, `EventARPage`, `ARSetCard`, `ARAssetList` | `useARSets`, `useEventAR` | `inventory` import | 9 |
| 11 | `MessagesPage`, `ActivityFeed`, unread badge | `useThreads`, `useMessages`, realtime | `messages`, `threads`, `activity` | 10 |
| 12 | Files tab, questionnaire uploads, chat attachments | `useUpload` | mock dropzones | 11 |
| 13 | Admin pages | `useAdmin*` | `PlaceholderPage` usages | 12 |

For each row, the PR must:

- [x] Replace data access with hooks; no direct `api.*` or fixture imports remain in the touched files.
- [x] Keep loading skeletons, add an inline error state with retry, keep the empty state.
- [x] Turn every toast-only action in the file into a real mutation (or remove the button) — no fake success toasts in `http` mode.
- [x] Invalidate the right query keys after mutations (e.g. questionnaire save → `['events', id]`).
- [x] Check dark mode and the "Elation decides / curated" copy rule.
- [x] Update the "Which page consumes what" table in `PLAN.md`.

## 13.4 Toast-only actions to make real (inventory)

| File | Action | Becomes |
| --- | --- | --- |
| `BudgetPage.tsx` | Send to consultant, Request quote, Reset, Seed | Step 8 endpoints |
| `MoodboardViewer.tsx` | Regenerate, Save as concept, Add to budget, Ask for swap | Step 7 endpoints |
| `MoodboardsPage.tsx` | Duplicate, Remove, Like | Step 7 |
| `InspirationsPage.tsx`, `InspirationDetailPage.tsx` | Adopt | Step 9 |
| `ProfilePage.tsx` | Save profile | `PATCH /me` |
| `SettingsPage.tsx` | Notifications, Password, Sign out others, Export, Delete account | Step 3 |
| `QuestionnairePage.tsx` | "Progress saved" | Saved indicator from real PATCH |
| `ARHero.tsx`, `ARSetCard.tsx`, `ARAssetList.tsx` | Book session, Send to headset, Notify me, Download | Step 9 |
| `ConsentGate.tsx` | Accept | `POST /me/consent` |
| `NewEventDialog.tsx` | Create | Step 4 |

## 13.5 Cleanup (end)

- Delete `src/mocks/fixtures.ts` usage from app code (keep fixtures only for Storybook/tests if wanted), `mocks/hydrate.ts`, `questionnaire/derived.ts` event resolution.
- Remove `VITE_API_MODE` mock branch from production builds (`if (import.meta.env.PROD)` guard) so a misconfigured build can't ship fake data.

## Definition of done

- [x] Production build with `VITE_API_MODE=http` has no reference to `src/mocks` (verify with `vite build` + bundle grep).
- [x] No toast claims success for an action that didn't hit the server.
- [x] All pages have loading, error and empty states against the real API.

## As built (2026-10-13)

Rows 1–12 of the migration table landed with Steps 3–11 (each step's "As built"); row 13 (admin pages) with Step 12. This step closes the playbook:

- **No demo data in production** (P57): every `vite build` aliases `@/mocks/fixtures` and `@/mocks/hydrate` to empty stubs (`src/lib/no-mocks*.ts`) and forces `API_MODE` to `http`; mock mode exists only in `vite dev`. `npm run check:bundle` (markers read from the fixtures: ids and emails; all of `dist/`) runs in CI after the normal build and after a `VITE_API_MODE=mock` build. `src/lib/api.ts` (Step 10) and `PlaceholderPage` (Step 12) are gone.
- **Errors**: a page-level `ErrorBoundary` (resets on navigation; logs only the error name in production); one throttled toast for failed loads when the server is down or the connection drops (mutations report their own errors; 401/403 route to sign-in / access-ended); inline `LoadError` with retry on every client page and section that loads data — shown only when nothing is cached, 404s keep their "not found" screens.
- **No fake actions**: every success toast follows a server response; the budget's "added" note says "Saving…" until the autosave confirms; AR model downloads are links (disabled until uploaded); the "System" theme now follows the device; dead social links removed.
- **Search**: the top-bar search (⌘K / Ctrl K) opens `/search` over events, saved concepts, the inspiration gallery and Elation's pieces (client-side over the loaded lists — P59).
- **Privacy summary** at `/terms`, linked from account activation (P58).
- `PLAN.md` "Which page consumes what" rewritten for the API; README updated.
- Review: [step-13-review.md](reviews/step-13-review.md).
