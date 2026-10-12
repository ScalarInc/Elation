# Step 9 review — Inspirations & AR sets

**Date:** 2026-10-13 · **Panel:** Backend Lead · Frontend Lead · Product/Elation Ops · DevOps · Security & Data
**Verdict:** ✅ Approved after fixes below.

## What was reviewed

- Shared: `packages/shared/src/api/{inspirations,ar}.ts`
- API: `server/src/modules/inspirations/`, `server/src/modules/ar/`, `server/src/lib/threads.ts` (shared SYSTEM-message helper, now also used by the budget hand-offs), emails, migration `ar_notify_requests`, seed (concept pieces, showcase sets, set assets)
- Webapp: `data/{inspirations,ar}.ts`, `AdoptInspiration`, `InspirationsPage` + dialog, `InspirationDetailPage`, `ARPage`, `EventARPage`, `ARSetCard`, `ARAssetList`, `ARHero`, `ARFloorPlanGallery`; `lib/api.ts` trimmed to messages + activity (Step 10)

## Evidence

| Check | Result |
| --- | --- |
| API tests (published-only list + filters by event type / tier / style / palette / text; detail with pieces and "from" price; adopt → lead moodboard + priced budget + style pre-fill; merge vs replace; answers and "Elation decides" never overwritten; no PKR 0 budget; other clients 404; AR list = own sets then showcase for uncovered types; assets; notify-me idempotent + not on ready sets + emailed once; session request emails the consultant; AR policy) | 9 pass |
| Seed | 6 concepts with 37 pieces, 3 event sets + 3 showcase sets, 48 assets; seed test updated |
| Whole suite | server 157 · shared 62 · webapp 3; typecheck, lint, build clean |
| Browser (Malaika) | Concept page lists the pieces with quantity rules and prices, "From PKR 51.3L for 200 guests"; merge/replace choice shown because the event has a budget; adopt → moodboard tab with *Garden of Dreams* as lead concept, toast "Its pieces were added to your budget"; AR page shows own sets by event date; "Notify me" → "We'll email you when it's ready"; "Book a headset session" → "Ayesha Malik will be in touch…"; asset table from the API; no console errors |

## Findings

| # | Persona | Finding | Severity | Resolution |
| --- | --- | --- | --- | --- |
| 1 | Product / Ops | Adopting a concept with no priced pieces into an event with no budget wrote `budgetPkr = 0`. | Medium | **Fixed** — the target is written through only when it's above zero. Test added. |
| 2 | Backend Lead | The pre-fill used version `?? 1` where the questionnaire expects `?? 0`. | Medium | **Fixed**. |
| 3 | Product / Ops | A client who handed Q10/Q16 to Elation ("Elation decides") would have had the delegation replaced. | Medium | **Fixed** — delegated questions count as answered. Test added. |
| 4 | Backend Lead | A pre-fill failure after the adoption committed returned 500; the retry would adopt twice. | Medium | **Fixed** — pre-fill failures are skipped, never returned. |
| 5 | Security | Adopt had no rate limit (each call creates a lead moodboard and messages the consultant). | Medium | **Fixed** — 10/hour per user. |
| 6 | Frontend Lead | The merge/replace choice survived switching events, so "replace" could carry over to another event's budget unseen. | Medium | **Fixed** — choosing an event resets to "add to my budget". |
| 7 | Frontend Lead | An AR load error showed "No AR set yet". | Medium | **Fixed** — error state with retry. |
| 8 | Frontend Lead | Showcase card copy pointed to a demo button that isn't shown to clients without events. | Low | **Fixed** — copy no longer points at it. |
| 9 | DevOps | `notifySetReady` could double-send under two concurrent "ready" flips. | Low | **Fixed** — each request is claimed before sending, released if the email fails. It's called from the admin status change in Step 12. |
| 10 | Product / Ops | The spec says "showcase sets + the client's sets"; the API hides a showcase set when the client already has their own set of that type. | Question → decided | **P33** below; spec updated. |
| 11 | Product / Ops | 3D model downloads need signed links from private storage. | Info | `downloadUrl` is `null` until file storage (Step 11); the UI says the model isn't uploaded yet. |

## Decisions taken by the panel

- **P32 — Adopting a concept.** It becomes the event's lead moodboard (gallery images + its pieces), its priced pieces go into the budget (new plan, or *add* / *replace* when one exists; unpriced pieces are reported — P31), and only empty, non-delegated style answers (Q10 aesthetic, Q16 colours) are pre-filled.
- **P33 — AR sets list.** A client sees their own sets first (by event date), then Elation's showcase set for each event type they don't have a set for yet — so there are always sets to look at, without duplicates.
- **P34 — "Send to headset" waits for the Quest app.** Ready sets on the client's own events offer "Book a headset session" instead; in-progress sets offer "Notify me".
- **P35 — The gallery filters in the browser.** It loads the whole published library once (dozens of concepts) for instant filtering and facet lists; the same filters exist on `GET /inspirations` for deep links and paging later.
