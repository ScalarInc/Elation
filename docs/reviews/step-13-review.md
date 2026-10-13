# Step 13 review — Frontend integration

**Date:** 2026-10-13 · **Panel:** Backend Lead · Frontend Lead · Product/Elation Ops · DevOps · Security & Data
**Verdict:** ✅ Approved after fixes below.

## What was reviewed

- Build: `webapp/vite.config.ts` (fixture/hydrate stubs on build), `src/lib/no-mocks*.ts`, `src/lib/api/client.ts` (http in production), `main.tsx`, `scripts/check-bundle.mjs`, CI steps
- Errors: `components/ErrorBoundary.tsx`, `lib/api/query-client.ts`, `components/ui/load-error.tsx` and error states across 16 client pages/components
- New: `/search` + top-bar search, `/terms` + activation link, real "System" theme (`lib/theme.ts`)
- `PLAN.md`, `README.md`

## Evidence

| Check | Result |
| --- | --- |
| `vite build` → `check:bundle` (58 markers from the fixtures, every file in `dist/`) | No demo data; a planted marker fails the check (exit 1) |
| `VITE_API_MODE=mock vite build` → `check:bundle` | No demo data (mock mode is dev-only) |
| Whole suite | server 203 · shared 62 · webapp 3; typecheck, lint, build clean |
| Browser (Malaika) | Dashboard, events, event detail, budget, moodboards, budgets, inspirations, AR render normally; search "noor" finds the event, concept and gallery entry; messages at 390 px wide fit without horizontal scroll |

## Findings

| # | Persona | Finding | Severity | Resolution |
| --- | --- | --- | --- | --- |
| 1 | Product / Security | Summary promised deletion one week after access ends; the purge job doesn't exist yet. | High | **Fixed** — sentence removed; the period goes in Elation's terms (P58). Purge is a Step 14 item. |
| 2 | Security / Product | Activation asked people to "agree to Terms & Conditions" that don't exist. | High | **Fixed** — "I've read the privacy summary"; legal terms ❓ Elation. |
| 3 | Frontend | "Added to …" success toast before the autosave. | High | **Fixed** — "… added — Saving…"; the autosave reports the result. |
| 4 | Frontend | AR download button for missing models was toast-only. | Medium | **Fixed** — disabled with an explanation; a link when the model exists. |
| 5 | Frontend | "System" theme was a "coming soon" toast. | Medium | **Fixed** — follows the device, and all theme controls stay in sync. |
| 6 | Frontend | Social links were `href="#"`. | Medium | **Fixed** — removed until Elation confirms its accounts. |
| 7 | Frontend | Server errors on mutations toasted twice. | Medium | **Fixed** — the shared toast is for loads only (P60). |
| 8 | Frontend | A background questionnaire sync failure replaced the editor. | Medium | **Fixed** — only a failed first load does. |
| 9 | Product | Crash screen promised work was saved. | Medium | **Fixed** — honest copy. |
| 10 | Security | Crash logs included full errors in production. | Low | **Fixed** — error name only. |
| 11 | DevOps | Bundle check had four hard-coded markers, JS only, and passed on an empty build. | Medium | **Fixed** — markers from the fixtures, all files, fails without JS. |
| 12 | DevOps | The production guard wasn't tested. | Medium | **Fixed** — CI also checks a mock-mode build. README updated. |
| 13 | DevOps | Why mock builds are empty wasn't documented. | Low | **Fixed** — comment. |
| 14 | Frontend | Search showed "No matches" when a list failed to load. | Medium | **Fixed** — per-group retry. |
| 15 | Backend / Frontend | Search loads whole lists. | Medium | **Decided** (P59) — fine at Elation's scale; server search later. |
| 16 | Frontend | Result counts not announced; search box stale after back/forward. | Low | **Fixed**. |
| 17 | Security | "Links expire after a few minutes" vague. | Low | **Fixed** — "within 10 minutes" (the real limit). |
| 18 | Product | Is the message-email switch real? | Question | Yes — `consultantMessages` gates the unread-message emails (Step 10); no marketing emails are sent. |
| 19 | Product | Landing page testimonial "Malaika K." | Question | The landing page isn't routed; ❓ Elation to supply real, consented quotes before it goes live. |
| 20 | Frontend | `useEventView` unused. | Low | **Fixed** — removed. |

## Decisions taken by the panel

- **P57** No demo data in any build; CI enforces it.
- **P58** `/terms` is a factual privacy summary until Elation's legal terms exist. ❓ Needs Elation.
- **P59** Client-side search for now.
- **P60** Error-reporting rules: inline retry when nothing is cached; one shared notice for failed loads; mutations report their own errors.
