# 00 — Decisions (ADR log)

Architecture decisions for the Elation X backend. The four foundational choices (D1–D4) were made by the product owner; the rest were decided by a five-person review panel, each looking at the problem from a different angle. Every decision lists the options considered and why the winner won, so anyone can revisit it with the original reasoning in hand.

## The panel

| Persona | Cares about | Typical question |
| --- | --- | --- |
| **Backend Lead** | Data model integrity, simple services, testability | "Where is the single source of truth?" |
| **Frontend Lead** | Not rewriting the UI, typed contracts, fast iteration | "Can I swap mocks for real data one page at a time?" |
| **Product / Elation Ops** | Consultant workflow, client experience, the spec | "Does this match what Elation promised its clients?" |
| **DevOps** | Cost, deploy simplicity, backups, few moving parts | "What do we run, and who gets paged?" |
| **Security & Data** | Private platform, PII of wedding clients, access expiry | "What happens the second an account expires?" |

Format: **Decision** · options · outcome · reasoning · vote (B / F / P / D / S).

---

## Owner decisions

### D1. Backend stack — Node.js + TypeScript + Fastify + Prisma + PostgreSQL
- Options: Fastify+Prisma · NestJS+Prisma · FastAPI (Python) · Supabase.
- Why: TypeScript end-to-end lets the frontend and backend share zod schemas, the questionnaire definition, and the budget math. Fastify is light, fast, has first-class schema validation and websocket support. Prisma gives typed queries and managed migrations.

### D2. Hosting — Railway (or Render) + Neon (or Railway Postgres) + Cloudflare R2
- Why: a long-lived Node process (needed for websockets) at low cost, managed Postgres with branching/backups, and R2 object storage with no egress fees for images and 3D assets.

### D3. Moodboard curation — rules-based scoring in v1, LLM re-rank in v2
- Why: v1 ships quickly, is explainable to consultants ("picked because: blush palette, romantic mood, stage area"), and costs nothing per generation. v2 adds a Claude-powered re-rank and concept narrative behind the same endpoint.
- Copy rule stays: the UI says "Elation curated", never "AI".

### D4. Repo — monorepo with `webapp/`, `server/`, `packages/shared/` (npm workspaces)
- Why: one PR can change an API contract and the UI that uses it; shared types cannot drift.

---

## Panel decisions

### P1. Authentication — own session-cookie auth (not JWT, not a third-party provider)
- Options: (a) httpOnly session cookie + Postgres `Session` table, (b) JWT access/refresh, (c) Clerk/Auth0/Supabase Auth.
- Outcome: **(a)**.
- Reasoning: The business rule "access stops the moment an admin revokes or the expiry passes" requires server-side state. JWTs stay valid until they expire; revocation then needs a denylist, which is a session table anyway. Third-party auth fights the invite-only + expiry model (no self-signup) and puts client PII with another vendor. Sessions are trivially revocable: delete the rows.
- Vote: B ✅ F ✅ P ✅ D ✅ S ✅

### P2. Passwords — argon2id; invite code sets the password
- Clients never self-register. Admin creates an **Invite** → client receives an email with a one-time code/link → sets a password → account active until `accessExpiresAt`.
- The existing sign-up tab on `/auth` becomes "Activate your invitation".
- Vote: unanimous.

### P3. Single source of truth for event basics — Event columns, with write-through from the questionnaire
- Problem: today `useResolvedEvent` overlays questionnaire answers (`q1_type`, `q2_name`, `q3_date`, `q4_guests`, `q5_venue`, `q6_indoor`, `q121_budget`) onto fixture events at render time. Two sources of truth.
- Options: (a) keep overlay on the client, (b) questionnaire is the truth and events are views, (c) Event columns are the truth; saving one of those seven answers updates the Event row in the same transaction, and editing the event updates the answers.
- Outcome: **(c)**.
- Reasoning: list pages, admin analytics, and SQL filters need real columns (`WHERE date > now()`). Write-through keeps the questionnaire experience unchanged. `resolveEvent`/`useResolvedEvent` disappear from the frontend.
- Vote: B ✅ F ✅ P ✅ D — S —

### P4. Questionnaire storage — one JSONB document per event + append-only revisions
- Options: (a) one row per answer (EAV), (b) JSONB answers document, (c) JSONB + revision log.
- Outcome: **(c)**.
- Reasoning: the frontend already treats answers as one `Record<string, unknown>`; JSONB keeps that shape, supports GIN-indexed analytics ("how many clients picked Romantic?"), and avoids 134 rows per event. A small revision table records who changed what, which consultants want ("client changed palette yesterday").
- Vote: B ✅ F ✅ P ✅ D ✅ S ✅ (S: revisions double as an audit trail)

### P5. Questionnaire definition moves to `packages/shared`
- The question list, branching rules (`showIf`), and progress math live in one place used by both browser and server. The server validates answers against it and computes progress, so the dashboard and admin show the same percentage the client sees.
- Vote: unanimous.

### P6. Event progress and status are computed, not stored
- `progress.{questionnaire,moodboard,budget,ar}` is derived on read from the questionnaire percent, saved moodboards, budget plan status, and AR set status. `status` stores only `draft | active | archived`; "past" is derived from `date < today`.
- Reasoning: stored progress drifts. Reads are cheap at this scale (tens of events per client).
- Vote: B ✅ F ✅ P ✅ D ✅ S —

### P7. Money — integer PKR everywhere
- `Int` columns in rupees (no paisa); max ~2.1 billion PKR per value is plenty for décor. No floats in money paths. Budget line items **snapshot the unit price** when added so later inventory price changes don't silently change a quoted plan; a "Prices updated — refresh" banner offers to re-price.
- Vote: P ✅ (quoted numbers must not move), others ✅.

### P8. Budget traffic light — follow the spec, thresholds in one shared constant
- The modular report says green = on budget, yellow = under, red = over. The current frontend uses yellow for both slightly-over and well-under.
- Outcome: one shared `classifyBudget()` in `packages/shared`:
  - **red**: total > target × 1.02 (over)
  - **green**: target × 0.85 ≤ total ≤ target × 1.02 (on budget)
  - **yellow**: total < target × 0.85 (under — room to add)
- ❓ **Needs Elation**: confirm the 2% tolerance and 85% floor.
- Vote: P ✅ (spec), F ✅ (one function), others ✅.

### P9. Realtime — `@fastify/websocket`, Postgres LISTEN/NOTIFY when we scale out
- Options: polling, SSE, websockets, Pusher/Ably.
- Outcome: one authenticated websocket per tab; server pushes `message.created`, `message.read`, `typing`, `activity.created`, `moodboard.ready`. Single instance at launch; when we add a second instance, fan-out goes through Postgres `LISTEN/NOTIFY` (no Redis).
- Reasoning: chat needs typing/read receipts (already designed in the UI). A third-party realtime service adds cost and another place PII lives.
- Vote: B ✅ F ✅ P ✅ D ✅ (no Redis) S ✅

### P10. Background jobs — pg-boss (Postgres-backed queue)
- Used for: emails, access-expiry sweep, image thumbnails, v2 LLM moodboard re-rank, quote-request notifications.
- Reasoning: no extra infrastructure; jobs are transactional with the data that triggers them.
- Vote: D ✅ (strong), others ✅.

### P11. File storage — Cloudflare R2 with presigned uploads
- Browser uploads directly to R2 using a short-lived presigned PUT URL; the API only stores metadata. Downloads use presigned GET URLs (private bucket) — wedding venue photos are private. Public, non-sensitive assets (inventory photos, inspiration covers) go to a separate public bucket behind a CDN domain.
- Vote: S ✅ (private by default), D ✅.

### P12. Validation & contracts — zod schemas in `packages/shared`, `fastify-type-provider-zod`
- Request/response schemas are defined once; the server validates with them, the frontend types with them. An OpenAPI document is generated from the same schemas for reference.
- Vote: F ✅ (strong), B ✅.

### P13. Frontend data fetching — TanStack Query, migrated page by page behind `VITE_API_MODE`
- `lib/api.ts` keeps its shape but gains an HTTP implementation. `VITE_API_MODE=mock|http` lets pages move over one at a time without a big-bang switch.
- Vote: F ✅ (strong), others ✅.

### P14. Moodboard concepts — each generation produces 1–3 draft concepts; client saves the ones they like
- The questionnaire's Q132 ("One mood board / 2–3 concepts / One recommended + alternatives") decides how many variants a generation returns. Drafts older than 30 days that were never saved are cleaned up by a job.
- Vote: P ✅ (matches the brief), B ✅.

### P15. Email provider — Resend
- Invites, password resets, access-expiry warnings (7 days and 1 day before), quote confirmations. Swappable behind a `mailer` interface.
- Vote: D ✅, others —.

### P16. Observability — pino logs, Sentry for errors, `/healthz` + `/readyz`
- Vote: D ✅, S ✅ (logs redact emails/phones/tokens).

### P17. IDs — UUIDv7 strings
- Time-ordered (good index locality, sortable), unguessable enough for URLs. Seed data keeps readable IDs only in tests.
- Vote: B ✅, S ✅ (no sequential IDs to enumerate).

### P18. Authorization — 404 for resources the user cannot see
- A client asking for another client's event gets 404, not 403, so IDs can't be probed. One helper (`assertEventAccess`) is used by every event-scoped route.
- Vote: S ✅ (strong), others ✅.

---

## Open questions for Elation (❓)

1. Default access period for new client accounts (panel assumption: **90 days**, extendable).
2. Traffic-light thresholds (P8).
3. Who supplies the inventory spreadsheet, and with which columns (see [step-06](step-06-inventory.md)). The `Inventory/` folder only has scanned PDFs.
4. Can a client have more than one consultant? (Assumption: one assigned consultant, admins see all.)
5. Should a client be able to delete their account themselves, or only request deletion? (Assumption: request → admin confirms.)
6. Is the public "Book consultation" form in scope for launch? (Assumption: yes, it feeds `/admin/inquiries`.)

## Deviation log

`YYYY-MM-DD — step — decision — why`
