# Step 9 — Inspirations & AR sets

**Owner:** @Safwan · **Frontend wiring:** @KnightX_O · **Estimate:** 2 days · **Depends on:** Steps 6, 7, 8

## Part 1 — Inspiration Gallery

> Spec: *"Upon selecting an inspiration, the client can directly adopt the showcased concept for their event or use it as a starting point for further customization, with the selected design elements and inventory carried forward into their personalized moodboard and budget estimation."*

Today `adopt()` in `InspirationDetailPage.tsx` / `InspirationsPage.tsx` only shows a toast and navigates — nothing is carried over.

### Data

`Inspiration` + `InspirationTile` (gallery images) + `InspirationItem` (inventory items with quantity rules: `qtyFixed` or `qtyPer100Guests`). Seeded from the 6 fixtures; real concepts come from the FMH Lookbook (`Moodboard_Isnpirations/`) via the admin CMS (Step 12).

### Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/inspirations?eventType=&style=&tier=&palette=&q=` | Published only (clients). Filters mirror the gallery filter bar |
| `GET` | `/inspirations/:slug` | With tiles and items (+ inventory DTOs and an indicative total for 200 guests) |
| `POST` | `/inspirations/:slug/adopt` | `{ eventId, mode: 'replace' \| 'merge' }` → `{ moodboardId, budgetPlanId }` |

### Adopt — what happens (one transaction)

1. `assertEventAccess(eventId)`.
2. Create a `Moodboard` (status `SAVED`, `isPrimary = true`, `sourceInspirationId`, `generator: "inspiration"`, palette from the inspiration): `INSPIRATION` tiles for the gallery images + `INVENTORY` tiles for each item.
3. Budget: no plan → create with `seededFrom: "inspiration"`; plan exists → `mode=replace` swaps lines, `mode=merge` adds missing items. Quantities from `qtyPer100Guests × guests / 100` (rounded up) or `qtyFixed`.
4. Pre-fill unanswered questionnaire style answers (Q10 aesthetic, Q13 colours) — never overwrite answers the client gave.
5. Activity "Adopted *Whispers of Noor*" + system message to the consultant.

UI: the adopt dialog asks which event (list from `useEvents()`), and if a plan exists, replace or merge. Then navigate to `/events/:id?tab=moodboard`.

## Part 2 — AR sets

The AR experience itself (Meta Quest 3 passthrough) is a separate build. The web app needs status, media and assets per set.

### Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/ar-sets` | Sets visible to the user: the three showcase sets + any set linked to their events |
| `GET` | `/events/:id/ar` | The event's set (or `null` + the showcase set matching the event type) |
| `GET` | `/ar-sets/:id/assets` | Asset list; each with a presigned download URL for the GLB/OBJ (private bucket, 10 min) — replaces the "Frontend mock — no download" toast in `ARAssetList.tsx` |
| `POST` | `/events/:id/ar/session-request` | "Book a headset session" → system message + consultant task (replaces the toast in `ARHero.tsx`) |
| `POST` | `/ar-sets/:id/notify-me` | For `coming-soon` sets — stored, emailed when status flips to READY |
| `POST` | `/ar-sets/:id/send-to-headset` | **Phase 2.** Returns a 6-digit pairing code the headset app polls. Until the Quest app exists, the button is hidden in production |
| admin CRUD | `/admin/ar-sets…` | status, progress %, ETA, media uploads, assets (Step 12) |

## Definition of done

- [ ] Adopting an inspiration creates a primary moodboard and a priced budget for the chosen event; both visible immediately.
- [ ] Gallery filters work server-side; unpublished concepts are invisible to clients.
- [ ] AR page reads status/progress/ETA from the API; asset downloads work with expiring links.
