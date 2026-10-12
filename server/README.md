# Elation X — server

Fastify + Prisma (PostgreSQL) API for Elation X. In production the same process also serves the built webapp, so web and API share one origin (see [`docs/step-14-deploy-ops.md`](../docs/step-14-deploy-ops.md)).

## Run locally

From the repo root:

```bash
npm install                  # installs every workspace, generates the Prisma client
npm run db:up                # Postgres 16 in Docker on localhost:55432
cp server/.env.example server/.env
npm run dev                  # server on :4000 + webapp on :5173 (Vite proxies /api)
```

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
- **Adding a migration:** edit `prisma/schema.prisma`, run `npm run db:migrate -w server -- --name <change>`, commit the generated folder under `prisma/migrations/`.
