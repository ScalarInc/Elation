# Step 1 — Foundation: monorepo, server scaffold, local DB, CI

**Owner:** @Safwan · **Reviewer:** @KnightX_O · **Estimate:** 1–2 days · **Depends on:** nothing

## Goal

A runnable, empty Fastify server inside the repo, a shared package both apps import, Postgres running locally in Docker, and CI that type-checks, lints, and tests all three workspaces on every PR.

## Tasks

### 1.1 npm workspaces

Root `package.json`:

```json
{
  "name": "elation-x",
  "private": true,
  "workspaces": ["webapp", "server", "packages/*"],
  "scripts": {
    "dev": "npm run dev --workspaces --if-present",
    "build": "npm run build -w packages/shared && npm run build -w server && npm run build -w webapp",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present",
    "test": "npm run test --workspaces --if-present"
  }
}
```

- Move `webapp/package-lock.json` to a single root lockfile (`npm install` at root).
- Add `.nvmrc` → `24` (current LTS).

### 1.2 `packages/shared` (`@elation/shared`)

- TypeScript library, ESM, **consumed as source** (package `exports` point at `src/*.ts`). Vite compiles it for the webapp; tsx runs it in dev; tsup bundles it into the server build. No separate build step.
- Only dependency: `zod`.
- First contents (moved, not rewritten):
  - `domain/enums.ts` — `EventType`, `ModuleStatus`, `InventoryCategory`, `InventoryUnit`, `Role` from `webapp/src/mocks/types.ts`.
  - `questionnaire/` — `webapp/src/questionnaire/schema.ts` plus the pure functions from `store.ts` (`isAnswered`, `computeCategoryProgress`, `computeOverallPercent`).
  - `budget/classify.ts` — `classifyBudget()` per [decision P8](00-decisions.md#p8-budget-traffic-light--follow-the-spec-thresholds-in-one-shared-constant).
- Webapp imports switch from `@/questionnaire/schema` to `@elation/shared/questionnaire`. No behaviour change.

### 1.3 `server/` scaffold

Dependencies:

| Package | Purpose |
| --- | --- |
| `fastify` | HTTP server |
| `fastify-type-provider-zod` | zod validation + typed routes |
| `@fastify/cookie`, `@fastify/cors`, `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/websocket`, `@fastify/sensible` | Platform plugins |
| `@fastify/swagger` + `@fastify/swagger-ui` | OpenAPI at `/api/docs` (non-production only) |
| `prisma`, `@prisma/client` | ORM + migrations |
| `pg-boss` | Job queue |
| `argon2` | Password hashing |
| `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` | R2 (S3-compatible) |
| `resend` | Email |
| `pino-pretty` (dev) | Readable logs |
| `tsx` (dev), `typescript`, `vitest` | Run, build, test |

Files:

- `src/config.ts` — parse `process.env` with zod; crash on boot if anything required is missing.
- `src/app.ts` — `buildApp(opts)` registers plugins and modules; returns the instance (tests call `app.inject()`).
- `src/server.ts` — `buildApp()` then `listen({ port: config.PORT, host: '0.0.0.0' })`, graceful shutdown on SIGTERM.
- `src/plugins/errors.ts` — maps zod errors, Prisma `P2025` (not found) and `P2002` (unique), and a custom `AppError(code, status, message)` to the error shape in [01-architecture](01-architecture.md#api-conventions).
- `GET /healthz` (process up) and `GET /readyz` (DB reachable).

Scripts: `dev` (`node --watch --import tsx src/server.ts`), `build` (tsup bundle), `start`, `typecheck`, `test`, `db:migrate`, `db:deploy`, `db:studio` (`db:seed` arrives in Step 2).

### 1.4 Environment

`server/.env.example`:

```dotenv
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://elation:elation@localhost:55432/elation
DATABASE_URL_TEST=postgresql://elation:elation@localhost:55432/elation_test
WEB_ORIGIN=http://localhost:5173
SESSION_COOKIE_DOMAIN=
SESSION_TTL_DAYS=14
DEFAULT_CLIENT_ACCESS_DAYS=90
EXPIRED_DATA_RETENTION_DAYS=7
SERVE_WEBAPP_DIST=           # path to webapp/dist in production (one-service deploy)

R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_PRIVATE_BUCKET=elation-private
R2_PUBLIC_BUCKET=elation-public
R2_PUBLIC_BASE_URL=

RESEND_API_KEY=
MAIL_FROM="Elation X <studio@example.com>"

SENTRY_DSN=
ANTHROPIC_API_KEY=          # v2 moodboard re-rank only
```

### 1.5 Local Postgres

`docker-compose.yml` at the repo root:

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: elation
      POSTGRES_PASSWORD: elation
      POSTGRES_DB: elation
    ports: ["55432:5432"]   # unusual host port avoids locally installed Postgres
    volumes: [pgdata:/var/lib/postgresql/data]
volumes:
  pgdata:
```

Plus `docker/init.sql` that creates `elation_test` and enables `citext`.

### 1.6 Webapp ↔ server in dev

`webapp/vite.config.ts`:

```ts
server: {
  proxy: { '/api': { target: 'http://localhost:4000', ws: true } },
}
```

### 1.7 CI (GitHub Actions)

`.github/workflows/ci.yml` on every PR and push to `main`:

1. `actions/setup-node` (22) with npm cache.
2. Service container `postgres:16`.
3. `npm ci` → `npm run typecheck` → `npm run lint` → `npx prisma migrate deploy -w server` (against test DB) → `npm test` → `npm run build`.

### 1.8 Conventions doc

`server/README.md`: how to run, module rule (routes → service → prisma), error codes list, how to add a migration.

## Definition of done

- [ ] `docker compose up -d && npm install && npm run dev` starts webapp on 5173 and server on 4000.
- [ ] `curl localhost:5173/api/v1/healthz` (through the proxy) returns `{ "ok": true }`.
- [ ] Webapp builds and behaves exactly as before, importing questionnaire schema from `@elation/shared`.
- [ ] CI is green on a PR.
- [ ] `.env.example` documents every variable; `.env` stays git-ignored.
