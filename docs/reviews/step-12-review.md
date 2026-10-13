# Step 12 review — Admin & consultant console

**Date:** 2026-10-13 · **Panel:** Backend Lead · Frontend Lead · Product/Elation Ops · DevOps · Security & Data
**Verdict:** ✅ Approved after fixes below.

## What was reviewed

- Shared: `packages/shared/src/api/admin.ts`, `inviteClientResponse.emailed`
- API: `server/src/modules/admin/` (clients, notes, quotes, inquiries, analytics, CMS, team, settings, audit, invites, routes), staff invite acceptance, new emails, migration `settings`, `trustProxy`
- Webapp: `data/admin.ts`, `components/admin/*`, `pages/admin/*`, `BookConsultationPage`, `AdminLayout`, routes

## Evidence

| Check | Result |
| --- | --- |
| Admin tests: invite → resend (old code dead) → activate → extend (+60 days, email, thread note) → revoke (sessions end) → restore, with the access history; consultant extension cap and admin-only revoke / reassign; reassignment moves threads and access; policy matrix (another consultant's client: detail, edit, extend, resend, notes, follow-ups, events → 404; lists scoped); clients and consultants kept out of admin-only routes; quote → quoted (plan, email), not reopenable; inquiries (public form, honeypot, rate limit, convert once with a draft event); analytics hand count (themes, bands, targets, lights, event types, full funnel, inventory use, consultant scope, CSV); CMS (draft → admin publish, slug clash, `javascript:` URL refused, delete admin-only; AR READY emails once, client activity; showcase sets admin-only); team (staff invite email, deactivation needs clients moved, last admin kept); settings (default access, cap, invite intro); invite takeover refused; revoked invite dead; concurrent extensions add up; impossible dates refused; CSV formula guard | 18 pass |
| Whole suite | server 203 · shared 62 · webapp 3; typecheck, lint, build clean |
| Browser (admin) | Overview KPIs, follow-ups, events, activity; clients table with filters; client detail (events, quotes, notes, access); quotes, inquiries, analytics (funnel, budget health, themes…), inventory (162 to price), inspirations, AR sets, team, settings — all on real data |

## Findings

| # | Persona | Finding | Severity | Resolution |
| --- | --- | --- | --- | --- |
| 1 | Security | A consultant re-inviting another consultant's pending client took it over and got the activation link. | High | **Fixed** — 409, no link. Test added. |
| 2 | Security | A revoked invited account could still activate with its old code. | High | **Fixed** — revoke kills open invites; acceptance requires an INVITED account. Test added. |
| 3 | Security | Consultants could change showcase AR sets (and email subscribers). | High | **Fixed** — showcase sets admin-only. Test added. |
| 4 | Security | `trustProxy: true` let callers spoof their IP (rate limits, audit). | High | **Fixed** — only Railway's single hop is trusted. |
| 5 | DevOps | A mail outage after an invite 500'd and lost the link. | Medium | **Fixed** — invite saved, link returned with `emailed: false`; the UI says so. |
| 6 | Security | Settings readable by consultants. | Medium | **Decided** (P54) — read for the limits their forms need; page and edits admin-only. |
| 7 | Product | Email and chat showed different dates for the same extension (UTC vs PKT). | Medium | **Fixed** — one Pakistan-time formatter; "until" dates end at 23:59 PKT. |
| 8 | Backend | Two concurrent extensions overwrote each other. | Medium | **Fixed** — row lock; they add up. Test added. |
| 9 | Backend | Detail showed deleted events. | Medium | **No change** — the soft-delete extension already hides them; archived events are shown, labelled. |
| 10 | Backend | Bulk built a full client detail per id. | Medium | **Fixed** — bulk uses internal steps; detail only on single routes. |
| 11 | Security | Note edits weren't audited. | Medium | **Fixed**. |
| 12 | Backend | A sent quote could be reopened while the plan stayed "quoted". | Medium | **Fixed** — a quoted quote can only be closed. Test added. |
| 13 | Backend | The "last admin" check could race. | Medium | **Fixed** — staff changes serialised by a lock, check inside. |
| 14 | Backend | Clients moved during a team change were read outside the transaction. | Medium | **Fixed**. |
| 15 | Backend | Analytics cache never cleared after writes. | Medium | **Decided** (P51) — 5-minute cache as specified, plus Refresh that bypasses it. |
| 16 | Product | Funnel mixed cohorts and units. | Medium | **Fixed** — clients who joined in the period, through each stage. Test asserts all six stages. |
| 17 | Backend | Dates were regex-only (2026-13-01 → 500). | Medium | **Fixed** — real calendar dates. Test added. |
| 18 | Security | Image URLs accepted `javascript:` / http. | Medium | **Fixed** — https or site paths only. Test added. |
| 19 | Product | Consultants see every inquiry. | Question → decided | **P55** — unassigned leads; overview now counts them for everyone. |
| 20 | Product | Consultants could publish inspirations to all clients. | Question → decided | **P53** — consultants draft; admins publish. Test added. |
| 21 | Backend | Converting an inquiry twice at once could create two clients/drafts. | Medium | **Fixed** — inquiry claimed first, released on failure. |
| 22 | Frontend | Bulk revoke was one click with a canned reason. | Medium | **Fixed** — confirmation with a reason (server requires one). |
| 23 | Frontend | Deactivating staff had no confirmation. | Medium | **Fixed**. |
| 24 | Frontend | Deleting a concept / removing a model had no confirmation. | Medium | **Fixed** — shared confirm dialog (also for revoking one client). Archiving inventory stays one click: it's undone with Restore. |
| 25 | Security | Missing tests for the cases above. | Medium | **Fixed** — added. |
| 26 | Security | Does the expiry sweep skip staff? | Question | Yes — it only touches `role: CLIENT`. |
| 27 | — | Turnstile, chart library, email templates, inquiry notifications. | Decision | **P56** deferred. |

## Decisions taken by the panel

- **P47** Settings table (default access, consultant extension cap, invite intro).
- **P48** Consultants extend up to 30 days at a time; bigger extensions, revoke, restore and reassignment are admin-only.
- **P49** Reassignment moves threads; the previous consultant loses access.
- **P50** Notes are internal.
- **P51** Live analytics with a 5-minute cache and Refresh; funnel by joining cohort.
- **P52** CSS bars, no chart library yet.
- **P53** Consultants draft inspirations; admins publish and delete; showcase AR sets admin-only.
- **P54** Settings readable by staff, editable by admins; the traffic light stays P8.
- **P55** Inquiries visible to all staff.
- **P56** Deferred: Turnstile, editable templates, inquiry notifications, charts.
