# Elation X — Handoff

**State on 2026-10-13:** Steps 1–13 of the plan are built, reviewed and pushed to the `feature/backend` branch (CI green). Step 14 (deployment & operations) is next. `main` still has the old frontend-only app: merge `feature/backend` into `main` after Step 14.

---

## 1. What Elation X is

A private, invite-only studio where Elation's clients plan their event décor: a 134-question questionnaire, Elation-curated moodboards drawn from Elation's real inventory, a budget estimator with a traffic light, an inspiration gallery, AR previews, live chat with their consultant and file uploads. Elation's team runs it all from an admin console.

## 2. Run it locally

You need **Node 24** (see `.nvmrc`) and **Docker** (it runs the Postgres database).

```bash
git clone <repo-url> && cd Elation
git checkout feature/backend
npm install                       # all workspaces: webapp, server, packages/shared
npm run db:up                     # Postgres 16 in Docker on localhost:55432 (dev + test databases)
cp server/.env.example server/.env
npm run db:deploy -w server       # create the tables (Prisma migrations)
npm run db:seed -w server         # demo data
npm run dev                       # API on :4000, web app on http://localhost:5173
```

Sign in (password for all: `elation-dev`):

| Role | Email | Lands on |
| --- | --- | --- |
| Client | `malaika.khan@example.com` | `/dashboard` |
| Consultant | `ayesha@elationbyfmh.com` | `/admin` |
| Admin | `admin@elationx.local` | `/admin` |

Good to know:
- **Emails** aren't sent locally: without `RESEND_API_KEY`, invite / reset / notification emails (with their links) are printed in the server log.
- **Uploads** are stored on disk in `server/.storage/` locally (signed links through the API); production uses Cloudflare R2.
- **Two users at once** (e.g. client + consultant chat): use two different browsers or a private window — one browser shares one session cookie.
- **Frontend without the server**: `VITE_API_MODE=mock npm run dev -w webapp` (dev only; builds always use the API).

### Checks (same as CI)

```bash
npm run typecheck && npm run lint && npm test && npm run build
npm run check:bundle -w webapp    # fails if demo data reaches the production bundle
```

Server tests use the `elation_test` database from Docker (`DATABASE_URL_TEST` in `server/.env`). CI: `.github/workflows/ci.yml`.

### Resetting the local database

The seed upserts and can collide with data you created by clicking around. To start clean: `npm run db:reset -w server` — **this wipes the local database**; never point it at anything shared.

## 3. Project layout

```
webapp/            React 19 + Vite + Tailwind + TanStack Query
  src/data/        one file per domain: the hooks every page uses to call the API
  src/pages/       client pages; src/pages/admin/ = admin console
  src/lib/         api client, realtime socket, uploads, theme
  src/mocks/       demo fixtures — dev-only mock mode, never shipped
server/            Fastify 5 + Prisma 7 + Postgres
  src/modules/     one folder per area: auth, events, questionnaire, inventory, moodboards,
                   budget, inspirations, ar, chat, activity, files, admin
  src/plugins/     auth (sessions), db, realtime (websocket + Postgres LISTEN/NOTIFY), errors
  src/lib/         policy (who may see what), storage (R2 / local), emails, threads …
  prisma/          schema.prisma, migrations/, seed/
packages/shared/   zod API schemas + types + the questionnaire & budget logic shared by both sides
docs/              the plan (step-01 … step-14), decisions, panel reviews, this handoff
```

## 4. What was built (Steps 1–13)

Each step file in this folder has the original plan plus an **"As built"** section at the end describing what actually shipped.

| # | Step | In one line |
| --- | --- | --- |
| 1 | [Foundation](step-01-foundation.md) | Monorepo, Fastify server, Docker Postgres, CI |
| 2 | [Database](step-02-database.md) | Prisma schema for every entity, soft deletes, seed from the old mock data |
| 3 | [Auth](step-03-auth.md) | Invite-only accounts with expiry, sessions, roles, password reset, consent |
| 4 | [Events](step-04-events.md) | Events API; hard-coded events gone |
| 5 | [Questionnaire](step-05-questionnaire.md) | All 134 questions, branching, server sync, submit |
| 6 | [Inventory](step-06-inventory.md) | Catalogue with Elation's real items (as drafts), CSV import/export |
| 7 | [Moodboards](step-07-moodboard.md) | Rules-based curation from inventory: 3 concepts, pins, swaps, "ask my consultant" |
| 8 | [Budget](step-08-budget.md) | Estimator on the API, traffic light, quotes, My Events → Budget journey |
| 9 | [Inspirations & AR](step-09-inspirations-ar.md) | Adoptable concepts; AR sets, "notify me", headset session requests |
| 10 | [Chat & activity](step-10-chat-activity.md) | Live chat (typing, read receipts), consultant inbox, activity feed, unread emails |
| 11 | [Files](step-11-files.md) | Direct-to-R2 uploads, location data stripped from photos, Files tab, chat attachments |
| 12 | [Admin console](step-12-admin.md) | Clients, quotes, inquiries, analytics, inventory, inspirations & AR CMS, team, settings |
| 13 | [Frontend integration](step-13-frontend-integration.md) | No demo data in builds, error states everywhere, search, privacy summary |

Tests at handoff: server 203, shared 62, webapp 3 — all passing.

## 5. How decisions were made

Every step was reviewed by a five-person panel (Backend Lead, Frontend Lead, Product/Elation Ops, DevOps, Security & Data). Findings were fixed or turned into recorded decisions.

- **[00-decisions.md](00-decisions.md)** — every decision, P1–P60, with the reasoning, plus the owner's answers (A1–A5) and open questions for Elation.
- **[reviews/](reviews/)** — one file per step (5–13): what was checked, every finding and how it was resolved.
- **[01-architecture.md](01-architecture.md)** — the overall design.

Decisions you'll bump into most often:
- **P18** — anything a user may not see returns 404, never 403. All access rules live in `server/src/lib/policy.ts`.
- **P8** — budget traffic light: green = on budget, yellow = under, red = over (thresholds in `packages/shared/src/budget/classify.ts`).
- **P31** — unpriced inventory ("price on request") never goes into a budget.
- **P37** — realtime events go through Postgres NOTIFY, so chat works with one server or several.
- **P42 / P46** — R2 in production, local disk in dev; photo originals are always private.
- **P48 / P53** — consultants extend access up to 30 days at a time; revoke, restore, reassign and publishing inspirations are admin-only.
- **P57** — no build can ship demo data; CI checks it.

Copy rule from the spec: always "Elation curated" / "Elation decides", never "AI".

## 6. What's left

### Step 14 — deployment & operations ([step-14-deploy-ops.md](step-14-deploy-ops.md))
- Railway: one service serving web + API, managed Postgres, environment variables (see `server/.env.example`; production refuses to start without R2 settings).
- Cloudflare R2: `elation-private` and `elation-public` buckets, a public domain for `elation-public` (`R2_PUBLIC_BASE_URL`), and the bucket CORS rule in [`server/deploy/r2-cors.json`](../server/deploy/r2-cors.json) — browsers upload straight to R2.
- Resend for email (`RESEND_API_KEY`, `MAIL_FROM` on Elation's domain).
- **Data retention purge** — delete expired clients' data 7 days after access ends (owner answer A5). Not built yet; `EXPIRED_DATA_RETENTION_DAYS` exists but nothing uses it.
- Content-Security-Policy (helmet's CSP is off until asset origins are final), backups, monitoring, the launch checklist.
- Then: merge `feature/backend` → `main`.

### Deferred by the panel (recorded decisions)
- **P41** — socket events for "moodboard ready" / "budget updated".
- **P45** — multipart uploads for very large files, a job queue for photo processing, malware scanning, moodboard reference tiles from uploads, avatar / event-cover upload UI.
- **P56** — Cloudflare Turnstile on the public form (honeypot + rate limit for now), editable email templates beyond the invite intro, staff notifications for new inquiries, a chart library.
- **P59** — server-side search (search filters loaded lists in the browser for now).
- Expiry warning emails before access ends (noted in `server/src/modules/auth/sweep.ts`).

### Needed from Elation
- **Prices** for the 162 real catalogue pieces (admin → Inventory → "Needs a price"); until then budgets and concepts mostly use the 18 placeholder items.
- **Legal terms** — `/terms` is a factual privacy summary only (P58); the real terms and the data-retention wording must come from Elation.
- **Sign-off** on the sample moodboards / curation quality.
- **Public site**: social media links and real, consented testimonials for the landing page (not routed yet).
- The open questions in [00-decisions.md](00-decisions.md#open-questions-for-elation-).

## 7. Working on it

- Branch from `feature/backend` (or `main` once merged); keep the step docs' "As built" sections and `00-decisions.md` up to date when behaviour changes.
- Schema changes: edit `server/prisma/schema.prisma`, add a migration (`npm run db:migrate -w server`), keep migrations additive.
- API shapes live in `packages/shared/src/api/` — change them there and both sides type-check against them.
- New page? Data through a hook in `webapp/src/data/`, with loading, error ("Try again") and empty states; no success toast before the server confirms.
