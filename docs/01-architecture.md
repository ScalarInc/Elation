# 01 — Architecture

## System overview

```
                         ┌──────────────────────────────────────────┐
  Browser (client,       │  webapp/  (Vite + React, static build)   │
  consultant, admin) ───▶│  app.elationx.com                        │
                         └───────────────┬──────────────────────────┘
                                         │ HTTPS  /api/v1/*  (cookie: elx_sid)
                                         │ WSS    /api/v1/ws
                         ┌───────────────▼──────────────────────────┐
                         │  server/  (Fastify, Node 22)             │
                         │  api.elationx.com                        │
                         │                                          │
                         │  modules: auth · users · events ·        │
                         │  questionnaire · inventory · moodboards ·│
                         │  budget · inspirations · ar · chat ·     │
                         │  activity · files · admin · inquiries    │
                         │                                          │
                         │  pg-boss workers (same process at first) │
                         └──────┬──────────────┬───────────────┬────┘
                                │              │               │
                     ┌──────────▼───┐  ┌───────▼──────┐  ┌─────▼────────┐
                     │ PostgreSQL   │  │ Cloudflare R2│  │ Resend       │
                     │ (Neon)       │  │ private +    │  │ (email)      │
                     │ data + queue │  │ public bucket│  └──────────────┘
                     └──────────────┘  └──────────────┘
                                                         ┌──────────────┐
                                        v2 only ───────▶ │ Claude API   │
                                                         │ (moodboard   │
                                                         │  re-rank)    │
                                                         └──────────────┘
```

Web and API sit on sibling subdomains of one registrable domain, so the session cookie is **same-site** (`SameSite=Lax`) and no third-party-cookie issues arise. In local dev, Vite proxies `/api` to the server so everything is same-origin.

## Repository layout (after Step 1)

```
.
├── package.json                 npm workspaces: webapp, server, packages/*
├── packages/
│   └── shared/                  @elation/shared — imported by webapp and server
│       └── src/
│           ├── domain/          enums + zod schemas: event, user, budget, moodboard, …
│           ├── questionnaire/   categories, questions, showIf rules, progress math
│           ├── budget/          classifyBudget(), totals, category grouping
│           ├── events/          progress + nextStep derivation
│           └── api/             request/response schemas per endpoint
├── server/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/
│   │   └── seed.ts              loads today's mock fixtures into the DB
│   └── src/
│       ├── app.ts               buildApp(): registers plugins + modules (used by tests)
│       ├── server.ts            listen()
│       ├── config.ts            env parsing with zod — fail fast on missing vars
│       ├── plugins/             db, auth, errors, rate-limit, websocket, jobs, storage, mailer
│       ├── modules/<name>/      routes.ts · service.ts · repo.ts (optional) · *.test.ts
│       ├── jobs/                pg-boss job handlers
│       └── lib/                 ids, time, money, logger, policy helpers
└── webapp/                      unchanged structure; lib/api.ts gains an HTTP mode
```

**Module rule:** `routes.ts` parses input and calls `service.ts`; `service.ts` holds business logic and talks to Prisma; no route touches Prisma directly. Services never import each other's internals — they call each other's exported service functions.

## API conventions

| Topic | Convention |
| --- | --- |
| Base path | `/api/v1` |
| Format | JSON, camelCase keys |
| IDs | UUIDv7 strings |
| Time | ISO-8601 UTC strings in JSON; `timestamptz` in Postgres. Event dates are calendar dates (`date` column, `YYYY-MM-DD`) — weddings don't have time zones |
| Money | Integer PKR, field names end in `Pkr` (`budgetPkr`, `unitPricePkr`) |
| Validation | zod schema per route from `@elation/shared`; 400 on failure with field paths |
| Errors | `{ "error": { "code": "EVENT_NOT_FOUND", "message": "…", "details": {…} } }` with stable `code`s the UI can switch on |
| Status codes | 200/201/204 · 400 validation · 401 no session · 403 `ACCESS_EXPIRED` / role · 404 not found or not yours · 409 version conflict · 422 business rule · 429 rate limit |
| Pagination | Cursor: `?limit=20&cursor=<opaque>` → `{ items, nextCursor }`. Lists that are always small (a client's events) return plain arrays |
| Concurrency | Documents edited from several tabs/people (questionnaire, budget plan) carry `version: number`. Writes send it; mismatch → 409 `VERSION_CONFLICT` with the current document |
| Idempotency | `POST`s that create things clients might double-click (quote request, generate moodboard) accept an `Idempotency-Key` header |
| CSRF | `SameSite=Lax` cookie + `Origin` header check on non-GET requests |

## Roles and access

| Role | Can see | Can do |
| --- | --- | --- |
| `client` | Own profile, own events and everything under them, published inventory/inspirations/AR, own threads | Edit own events, questionnaire, moodboards, budget; message their consultant |
| `consultant` | Clients assigned to them and everything under those clients | Everything a client can on those events + notes, extend access (if allowed), reply in threads |
| `admin` | Everything | Invite/extend/revoke users, manage inventory, inspirations, AR sets, team, settings |

Every request passes through the auth plugin:

1. Read `elx_sid` cookie → hash → look up `Session` (+ user) → 401 if missing/expired.
2. If user is a client and `accessExpiresAt < now()` or status is `revoked` → delete their sessions, return 403 `ACCESS_EXPIRED`. The frontend shows a dedicated "Your access has ended — contact your consultant" screen.
3. `request.user` is set; route-level guards check role; event-scoped routes call `assertEventAccess(user, eventId)`.

## Realtime

- `GET /api/v1/ws` upgrades to a websocket authenticated by the same cookie.
- Client sends: `subscribe {threadId}`, `typing {threadId}`, `read {threadId, messageId}`.
- Server sends: `message.created`, `message.read`, `typing`, `activity.created`, `moodboard.ready`, `budget.updated` (when a consultant edits a plan the client has open).
- An in-process hub maps userId → sockets. Scale-out: publish through Postgres `NOTIFY elation_events`, each instance `LISTEN`s and forwards to its local sockets.

## Background jobs (pg-boss)

| Job | Trigger | What it does |
| --- | --- | --- |
| `email.send` | invite, reset, quote, expiry warning | Render template, send via Resend |
| `access.expiry-sweep` | cron, hourly | Mark expired clients, kill their sessions, write activity |
| `access.expiry-warning` | cron, daily | Email clients 7 days and 1 day before expiry; notify consultant |
| `files.process-image` | upload completed | Generate thumbnails (sharp), read dimensions |
| `moodboard.rerank` (v2) | after rules generation | Claude re-rank + narrative, then push `moodboard.ready` |
| `moodboard.cleanup` | cron, daily | Delete unsaved draft concepts older than 30 days |

## Domain map (what talks to what)

```
User ─┬─< Event ─┬── QuestionnaireResponse ──< QuestionnaireRevision
      │          ├─< Moodboard ──< MoodboardTile >── InventoryItem
      │          ├── BudgetPlan ──< BudgetLine >──── InventoryItem
      │          │        └──< QuoteRequest
      │          ├─< File
      │          ├── ARSet ──< ARAsset
      │          └─< ActivityEntry
      ├─< Thread ──< Message ──< File (attachments)
      ├─< Session, Invite, Consent
      └── consultant (User)

Inspiration ──< InspirationTile, InspirationItem >── InventoryItem
```

Full Prisma schema: [step-02-database.md](step-02-database.md).
