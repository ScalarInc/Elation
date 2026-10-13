# Elation X — server

Fastify + Prisma (PostgreSQL) API for Elation X. In production the same process also serves the built webapp, so web and API share one origin (see [`docs/step-14-deploy-ops.md`](../docs/step-14-deploy-ops.md)).

## Run locally

From the repo root:

```bash
npm install                  # installs every workspace, generates the Prisma client
npm run db:up                # Postgres 16 in Docker on localhost:55432
cp server/.env.example server/.env
npm run db:deploy -w server  # apply migrations
npm run db:seed -w server    # demo data (idempotent)
npm run dev                  # server on :4000 + webapp on :5173 (Vite proxies /api)
```

Demo logins (password `elation-dev`): client `malaika.khan@example.com`, consultant `ayesha@elationbyfmh.com`, admin `admin@elationx.local`.

**Inviting a client locally:** sign in as the consultant or admin, then `POST /api/v1/admin/clients/invite` with `{ "name", "email" }`. Without `RESEND_API_KEY` the invitation email (with its activation link) is printed to the server log; open the link to activate. Password-reset emails work the same way.

Auth model in one paragraph: an httpOnly `elx_sid` cookie maps to a hashed row in `Session`; every request re-checks the user's access (client expiry / revocation) and ends all their sessions the moment access is gone. Routes opt in with `app.requireAuth` / `app.requireRole(...)` as `onRequest` hooks, and resource checks go through `src/lib/policy.ts` (404 for anything the caller can't see). Details: [`docs/step-03-auth.md`](../docs/step-03-auth.md).

Check: <http://localhost:5173/api/v1/readyz> → `{"ok":true,"checks":{"database":"up"}}`.

The database runs on host port **55432** so it never collides with a locally installed Postgres on 5432/5433. Override with `DB_PORT=… npm run db:up` and update `.env` to match.

## Scripts (`npm run <script> -w server`)

| Script | What it does |
| --- | --- |
| `dev` | `node --watch` + tsx, restarts on change |
| `build` | Bundle `src/server.ts` (and `@elation/shared`) into `dist/` with tsup |
| `start` | Run the bundle |
| `typecheck`, `lint`, `test` | tsc, oxlint, vitest (tests use `DATABASE_URL_TEST`) |
| `db:migrate` | Create + apply a migration in development (`prisma migrate dev`) |
| `db:deploy` | Apply pending migrations (CI / Railway pre-deploy) |
| `db:generate` | Regenerate the Prisma client into `src/generated/prisma` (also runs on install) |
| `db:seed` | Load demo data from `prisma/seed/fixtures.json` (idempotent) |
| `db:reset` | Drop the dev database, re-run migrations and the seed |
| `db:studio` | Prisma Studio |

## Layout

```
src/
  app.ts            buildApp(config) — plugins + routes; used by server.ts and tests
  server.ts         listen + graceful shutdown
  config.ts         env parsed with zod; the process refuses to start on bad config
  plugins/          db (Prisma), errors (error shape), webapp (static files in production)
  modules/<name>/   routes.ts → service.ts → Prisma; tests next to the code
  lib/              AppError and shared helpers
  test/             test helpers (buildTestApp)
  generated/        Prisma client (git-ignored)
prisma/
  schema.prisma     data model (Step 2)
prisma.config.ts    Prisma 7 config: schema path, migrations path, DATABASE_URL
```

## Conventions

- **Module rule:** `routes.ts` validates input (zod) and calls `service.ts`; only services talk to Prisma.
- **Errors:** throw `new AppError(code, status, message, details?)`. Every error response is
  `{ "error": { "code", "message", "details"? } }`.

  | Code | Status | When |
  | --- | --- | --- |
  | `VALIDATION_FAILED` | 400 | zod rejected the request; `details` lists paths |
  | `ROUTE_NOT_FOUND` | 404 | no such route |
  | `NOT_FOUND` | 404 | Prisma record missing (P2025) |
  | `ALREADY_EXISTS` | 409 | unique constraint (P2002) |
  | `INTERNAL` | 500 | anything unhandled (logged, never leaked) |

  Module-specific codes (`EVENT_NOT_FOUND`, `ACCESS_EXPIRED`, `VERSION_CONFLICT`, …) are documented in each step doc.
- **Routes** live under `/api/v1`. `GET /api/v1/healthz` = process up; `GET /api/v1/readyz` = database reachable.
- **Adding a migration:** edit `prisma/schema.prisma`, run `npm run db:migrate -w server -- --name <change>` in an interactive terminal (it can prompt), commit the generated folder under `prisma/migrations/`. Raw SQL that Prisma can't express (partial indexes, extensions) goes into the migration file via `--create-only` before applying.
- **Soft delete:** `User`, `Event`, `File` reads hide rows with `deletedAt` set (Prisma extension in `plugins/db.ts`). Pass an explicit `deletedAt` filter to see them. Nested `include`s are not filtered.
- **Enums:** the API uses display labels (`'Corporate Event'`), the DB uses keys (`CORPORATE_EVENT`); convert only through `src/lib/enums.ts`.
- **Tests** run against `DATABASE_URL_TEST`; the global setup migrates it, and `src/test/db.ts` has `resetDb()` + fixtures helpers.
