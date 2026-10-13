# Step 12 — Admin & consultant API

**Owner:** @Safwan (API) · @KnightX_O (admin pages) · **Estimate:** 5 days · **Depends on:** Steps 3–10

> Spec: *"Backend dashboard for the Elation team to manage client access and view inquiries, generated concepts, consultation progress, follow-ups, and analytics on client preferences, popular themes, budget ranges, and consultation trends."*

The admin routes in `App.tsx` (`/admin`, `/admin/clients`, `/admin/inquiries`, `/admin/analytics`, `/admin/inventory`, `/admin/inspirations`, `/admin/settings`) are placeholders today. All endpoints below are under `/api/v1/admin`, require `consultant` or `admin`, and consultants are automatically scoped to their own clients.

## Client management (`/admin/clients`)

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/admin/clients?status=&consultantId=&q=&sort=&cursor=` | Table rows: name, email, primary event type/date, status (active/expired/invited/revoked), `accessExpiresAt`, `lastActiveAt`, consultant, questionnaire %, has quote |
| `POST` | `/admin/clients/invite` | `{ name, email, phone?, consultantId, accessDays (default 90), eventType?, eventDate? }` → creates `User(INVITED)` + `Invite`, optionally a first DRAFT event, emails the link. Returns the activation link too (for WhatsApp sharing) |
| `POST` | `/admin/clients/:id/resend-invite` | new code, old one revoked |
| `POST` | `/admin/clients/:id/extend` | `{ days }` or `{ until }` → updates expiry, EXPIRED → ACTIVE; system message to client; `AuditLog` |
| `POST` | `/admin/clients/:id/revoke` | `{ reason }` → REVOKED, sessions deleted; `AuditLog` |
| `POST` | `/admin/clients/:id/restore` | admin only |
| `PATCH` | `/admin/clients/:id` | consultant reassignment, contact details |
| `GET` | `/admin/clients/:id` | Client detail: profile, events (with progress), moodboards, budget plans + quotes, questionnaire briefs, threads, notes, access history (audit) |
| `POST` | `/admin/clients/bulk` | `{ ids, action: 'extend' \| 'revoke', days? }` |

Consultants may extend by up to 30 days at a time; larger extensions and revocations are admin-only (❓ **Needs Elation** — confirm).

## Follow-ups & notes

| Method | Path | Notes |
| --- | --- | --- |
| `GET/POST` | `/admin/clients/:id/notes` | `ConsultantNote` with optional `followUpAt` |
| `PATCH` | `/admin/notes/:id` | edit / mark done |
| `GET` | `/admin/follow-ups?due=today\|overdue\|week` | Consultant's to-do list (dashboard widget) |

## Quotes

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/admin/quotes?status=` | Quote requests queue |
| `PATCH` | `/admin/quotes/:id` | status → IN_REVIEW / QUOTED / CLOSED; QUOTED moves the plan to `quoted` and notifies the client |

## Inquiries (`/admin/inquiries`)

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/public/inquiries` | Public "Book consultation" form (no auth; rate-limited 3/hour/IP; honeypot field + Cloudflare Turnstile) |
| `GET` | `/admin/inquiries?status=` | |
| `PATCH` | `/admin/inquiries/:id` | status, notes |
| `POST` | `/admin/inquiries/:id/convert` | Pre-fills the invite form from the inquiry → creates client, links `convertedUserId` |

## Overview & analytics (`/admin`, `/admin/analytics`)

All accept `?from=&to=&consultantId=`. Computed with SQL over the real tables (JSONB queries on questionnaire answers use the GIN index). Cached for 5 minutes.

| Endpoint | Returns |
| --- | --- |
| `GET /admin/overview` | KPIs: active clients, consultations this week (invites accepted + new inquiries), moodboards generated, average target budget, open quotes; upcoming events (next 30 days); recent activity |
| `GET /admin/analytics/themes` | Top Q10 aesthetics, Q11 atmospheres, adopted inspirations, primary-moodboard moods |
| `GET /admin/analytics/budgets` | Distribution of Q121 bands and plan targets; % of plans green/yellow/red |
| `GET /admin/analytics/event-types` | Count by type per month |
| `GET /admin/analytics/funnel` | Invited → activated → questionnaire ≥ 50 % → submitted → moodboard saved → quote requested |
| `GET /admin/analytics/inventory` | Most-used inventory items in saved moodboards and budget plans (tells Elation what to stock) |
| `GET /admin/analytics/export.csv?report=` | CSV export of any report |

## CMS

- **Inventory** — Step 6 endpoints.
- **Inspirations** — `GET/POST/PATCH/DELETE /admin/inspirations`, tiles and items sub-resources, `publish`/`unpublish`.
- **AR sets** — `GET/POST/PATCH /admin/ar-sets`, assets sub-resource, status/progress/ETA updates (status → READY notifies "notify me" subscribers).
- **Team** (`admin` only) — `GET/POST/PATCH /admin/team`: invite consultants/admins, deactivate, reassign their clients in bulk.
- **Settings** (`admin` only) — `GET/PATCH /admin/settings`: default access days, traffic-light thresholds, moodboard weights, email templates' editable copy. Stored in a `Setting(key, value Json)` table (add in this step's migration).

## Audit

Every admin mutation writes `AuditLog { actorId, action, targetType, targetId, before, after, ip }`. `GET /admin/audit?targetId=` powers the client detail "Access history".

## Frontend (@KnightX_O)

Build in this order (matches `PLAN.md` §6): Clients table + invite modal → Client detail → Overview → Quotes queue → Inquiries → Inventory (TanStack Table + CSV import) → Inspirations CMS → Analytics (Recharts) → Team → Settings. `AdminLayout` shows Team/Settings only to admins.

## Definition of done

- [x] Admin can invite, extend, revoke and restore a client end-to-end, with emails and audit entries.
- [x] Consultant sees only their clients everywhere in admin, verified by the policy test matrix.
- [x] Analytics numbers reconcile with a hand count on seeded data.
- [x] Every placeholder admin route renders real data.

## As built (2026-10-13)

- **Clients** (`server/src/modules/admin/clients.ts`): list (status / consultant / search / sort, paged), detail (events with progress, quotes, notes, threads, access history), resend invite, extend (row-locked; consultants up to `consultantMaxExtendDays`, default 30 — P48), revoke (admin; sessions, sockets and open invites end), restore (admin), contact edits, reassignment (admin; P49), bulk extend / revoke (revoke needs a reason). Extending posts "Your access has been extended to …" in the client's thread and emails them.
- **Notes & follow-ups** (`notes.ts`): internal only (P50), audited; `/admin/follow-ups?due=` feeds the overview.
- **Quotes** (`quotes.ts`): queue + status changes; QUOTED marks the plan quoted and tells the client (message, activity, email); a sent quote can only be closed.
- **Inquiries** (`inquiries.ts`): `POST /public/inquiries` (3/hour/IP, honeypot), inbox, convert = invite (+ a draft event when a type was given), claimed so it can't run twice. Visible to all staff (P55).
- **Overview & analytics** (`analytics.ts`): KPIs, upcoming events, follow-ups, activity; themes, budgets, event types, client funnel (per joining cohort), inventory use; CSV export (formula-safe). 5-minute cache with a Refresh that bypasses it (P51).
- **CMS** (`cms.ts`): inspirations (create/edit with tiles and pieces; publish/unpublish and delete admin-only — P53); AR sets (create, edit, status/progress/ETA — READY emails "notify me" subscribers once — and 3D model assets; showcase sets admin-only).
- **Team & settings** (`team.ts`, `settings.ts`, migration `settings`): invite staff (no access expiry), roles, deactivate (clients must be moved first; never the last admin), move clients in bulk; settings `defaultAccessDays`, `consultantMaxExtendDays`, `inviteIntro` (P47, P54).
- **Audit**: every mutation above writes `AuditLog`; `GET /admin/audit?targetId=` (admin).
- **Security**: consultants are scoped to their clients on every route (test matrix in `admin.test.ts`); a consultant can't take over another's pending invite; revoked accounts can't use an old invite; `trustProxy` trusts only Railway's hop.
- **Webapp**: `pages/admin/*` — Overview, Clients (+ invite dialog, bulk), Client detail, Messages, Quotes, Inquiries, Analytics, Inventory (edit, photo upload, CSV import with preview, export), Inspirations CMS, AR sets, Team, Settings; `AdminLayout` role-aware with a mobile drawer; destructive actions confirm; public `/book-consultation` form. `PlaceholderPage` is gone.
- Not built here (P56): Cloudflare Turnstile on the public form, editable email templates beyond the invite intro, inquiry notifications to staff, charts library.
- Review: [step-12-review.md](reviews/step-12-review.md).
