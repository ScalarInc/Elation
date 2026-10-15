# Step 14 — Deployment, security & operations

**Owner:** @Safwan · **Estimate:** 2–3 days (staging early, production at the end) · **Depends on:** Step 1 for staging; everything for production

## Environments

| Env | App (web + API, one service) | DB | Storage | Deploys from |
| --- | --- | --- | --- | --- |
| local | Vite :5173 proxying `/api` → server :4000 | Docker Postgres | R2 dev bucket (or MinIO in Docker) | — |
| staging | Railway service `elation-staging` (`*.up.railway.app`) | Railway Postgres (staging) | `elation-staging-*` buckets | `feature/backend` / `main` (auto) |
| production | Railway service `elation-prod` (`*.up.railway.app`, custom domain later) | Railway Postgres (prod) | `elation-prod-*` buckets | Git tag `v*` (manual approval) |

Hosting ([D2](00-decisions.md#d2-hosting--railway-or-render--neon-or-railway-postgres--cloudflare-r2), owner answer A4 — all on Railway):

- **One service serves web + API.** Railway's default domains (`*.up.railway.app`) are on the Public Suffix List, so a separate web service and API service would be *cross-site* and the `SameSite=Lax` session cookie would not be sent. Instead, the Fastify server serves the built `webapp/dist` with `@fastify/static` (SPA fallback to `index.html` for non-`/api` routes) and the API under `/api/v1` — same origin, no CORS, no cookie issues. If a custom domain is added later, the split can stay or be revisited.
- **Image** — `Dockerfile` at the repo root (multi-stage, `node:24-slim`, non-root): builds `packages/shared`, `webapp`, `server`; copies `webapp/dist` into the runtime image. Health check `/api/v1/readyz`. Starts with 1 instance (512 MB–1 GB). Websockets supported natively.
- **Database** — Railway Postgres 16 in the same project/region; app connects over the private network (`DATABASE_URL` reference variable). Migrations run as the service's pre-deploy command (`npx prisma migrate deploy`).
- **Storage** — Cloudflare R2: private bucket + public bucket (R2 public dev URL until a custom domain exists).
- **Email** — Resend; until a sending domain exists, use Resend's test sender in staging only.

## Release pipeline

1. CI (Step 1) green on the PR.
2. Merge to `main` (or `feature/backend` while the backend is being built) → GitHub Action / Railway auto-deploy:
   `npx prisma migrate deploy` against staging → deploy the app service → smoke tests (`/readyz`, login as seeded staging user, `GET /events`).
3. Tag `vX.Y.Z` → same against production after manual approval in GitHub Environments.
4. Migrations are **expand → migrate → contract**: add columns/tables first, deploy code that writes both, backfill, then drop old in a later release. No destructive migration in the same release as the code that stops using the column.

## Security baseline

| Area | Measure |
| --- | --- |
| Transport | HTTPS only, HSTS (via `@fastify/helmet`) |
| Headers | CSP on the web app (self + CDN + R2 domains), `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin` |
| CORS | Only `WEB_ORIGIN`, `credentials: true` |
| R2 bucket CORS | `elation-private`: PUT/GET/HEAD from `APP_URL` only, headers `Content-Type`, `If-None-Match` — [`server/deploy/r2-cors.json`](../server/deploy/r2-cors.json) (uploads go browser → R2, Step 11) |
| Auth | Step 3 checklist (argon2id, rate limits, hashed tokens, session revocation, Origin check) |
| Authorization | Policy matrix tests in CI for every route |
| Input | zod on every route; Prisma parameterises queries; chat rendered as text |
| Uploads | Type/size limits, presigned URLs, private bucket, EXIF stripped |
| Secrets | Platform env vars only; never in the repo; rotated when someone leaves |
| PII | Pino `redact` for email/phone/password/token/cookie; Sentry `beforeSend` scrubs the same |
| Dependencies | Dependabot weekly; `npm audit --omit=dev` in CI (fail on high) |
| Data retention | Expired clients' data anonymised/deleted **7 days** after access expiry by a daily job (owner answer A5; setting `EXPIRED_DATA_RETENTION_DAYS`). Extending access before day 7 keeps everything |
| Bot protection | Turnstile on public inquiry form and login after 3 failures |

## Backups & recovery

- Railway Postgres scheduled backups (enable in the database service) + a nightly `pg_dump` to a separate R2 bucket kept 30 days (job in pg-boss or a GitHub Actions cron).
- R2 private bucket: object versioning on; lifecycle deletes old versions after 30 days.
- Restore drill once before launch: restore last night's dump into a throwaway Railway Postgres and run the smoke tests against it. Document the steps in `server/RUNBOOK.md`.

## Observability

- **Logs** — pino JSON → platform log drain (Railway/Render) → optionally Better Stack/Axiom. Every request logs `reqId`, `userId`, route, status, duration.
- **Errors** — Sentry for API and web (release = git SHA; source maps uploaded in CI).
- **Uptime** — external monitor on `/readyz` and the web root, alert to the team's WhatsApp/Slack/email.
- **Metrics worth watching** — p95 latency per route, 5xx rate, `moodboard.generate` duration, pg-boss queue depth/failed jobs, DB connections.

## Performance targets

| Route | p95 |
| --- | --- |
| Reads (`/events`, `/events/:id/budget`, …) | < 200 ms |
| Questionnaire PATCH | < 250 ms |
| Moodboard generate (rules v1, ~500 items) | < 800 ms |
| Websocket message fan-out | < 300 ms |

## Testing strategy (whole project)

| Layer | Tool | What |
| --- | --- | --- |
| Shared pure logic | Vitest | questionnaire branching/progress, budget classify/seed, event progress, curation engine |
| API | Vitest + `app.inject()` + real Postgres (test DB, truncated per file) | every route: happy path, validation, policy matrix |
| E2E | Playwright against staging-like local stack | Login → create event → questionnaire → generate moodboard → save → budget from moodboard → request quote → consultant sees quote → admin extends access |
| Load (pre-launch) | k6 | 50 concurrent clients on questionnaire + chat |

## Launch checklist

- [ ] Real inventory imported and reviewed by Elation.
- [ ] Elation signed off on moodboard samples and traffic-light thresholds.
- [ ] All ❓ open questions in [00-decisions.md](00-decisions.md) answered.
- [ ] Admin + consultant accounts created; seed/demo data removed from production.
- [ ] Email deliverability verified (invite lands in Gmail inbox, not spam).
- [ ] Backup restore drill done.
- [ ] Privacy policy / terms text final (the consent gate references them).
- [ ] Sentry + uptime alerts routed to a person.

---

## As built (2026-10-15)

Operator steps (setup, deploy, rollback, backups, restore, incidents, secrets) are in [`server/RUNBOOK.md`](../server/RUNBOOK.md).

- **Image and hosting**: a root `Dockerfile` with build, deps and runtime stages on `node:24-slim`. It runs as the `node` user, has a `HEALTHCHECK` on `/healthz`, and the build fails if demo data reaches the bundle. [`railway.json`](../railway.json) sets the Dockerfile builder, `npx prisma migrate deploy` as the pre-deploy command, a health check on `/api/v1/readyz`, and a short overlap/drain. `.dockerignore` / `.railwayignore` keep docs, scans and env files out. The image is about 1.1 GB, mostly the Prisma CLI that the migration step needs. Checked locally: migrations ran on an empty Postgres, the smoke test passed, and the container reported healthy.
- **Release pipeline** (P66): `.github/workflows/deploy.yml` deploys to staging after CI passes on `main`. A `v*` tag deploys to production, but only for a commit on `main` with green CI, and only after a reviewer approves the `production` environment. A manual run deploys any ref. `deploy-env.yml` tags `RELEASE`, runs `railway up --ci` and then [`scripts/smoke.mjs`](../scripts/smoke.mjs) with retries. The smoke test checks health, readiness, the web app and its security headers, the SPA fallback, a 401 when signed out, the release, and optionally a sign-in. Railway's own GitHub autodeploy stays off.
- **First admin** (P68): `node dist/create-admin.js --email … --name …` (`npm run admin:create -w server` locally) prints a one-time 48-hour activation link. It refuses to run once an active admin exists.
- **Data retention** (A5, P61): the hourly sweep expires clients, then sends access emails, then purges. Clients expired for more than `EXPIRED_DATA_RETENTION_DAYS` lose their events (with everything under them), threads, files (including the stored bytes), notes, consents, sessions and invites. The User row stays as an anonymised placeholder (`purgedAt`), and its email is freed for a fresh invite. Audit rows keep the action and date but drop their before/after details. Converted inquiries are anonymised. The admin client page shows the deletion date. Migration `retention`.
- **Access emails** (P62): 7 days before, 1 day before, and on the day access ends (with the deletion date; the consultant gets a copy). Each is sent once per access window, and an extension starts them over. A failed send is retried on the next sweep.
- **Security headers** (P63): helmet's CSP is built from config ([`lib/csp.ts`](../server/src/lib/csp.ts)):
  - scripts only from our own origin
  - `connect-src` covers the websocket, the R2 bucket hosts of the configured account, the public bucket, and Sentry's ingest host
  - `img-src https:` because the inspiration CMS accepts https image links
  - `frame-ancestors 'none'`, and `upgrade-insecure-requests` in production
- **Logs** (P64): pino redacts emails, phones, passwords, tokens and cookies, and strips signed-link tokens and invite codes from logged URLs. Without `RESEND_API_KEY` outside development, emails fail (they are never logged with their links). A failing reset email no longer surfaces as a 500.
- **Errors** (P65): Sentry for the API (`SENTRY_DSN`: 5xx responses, failed sweeps) and the browser (`SENTRY_WEB_DSN`, delivered at runtime by `GET /api/v1/client-config`, SDK loaded only when it's set). Data collection is off, events are scrubbed of PII, and no tracing runs. The release is the deployed commit.
- **Backups** (P67): `.github/workflows/backup.yml` runs nightly. It pipes `pg_dump` through gpg (AES-256, passphrase) into a separate R2 bucket, checks the dump reads back, and prunes after 30 days. The client must match the server's major version (16); a 17 client's dump fails to restore into 16. Restore drill done locally (dump → decrypt → restore, row counts match). The drill against Railway is still on the launch checklist.
- **Dependencies** (P69): Dependabot runs weekly for npm, Actions and Docker, grouped minor/patch. CI runs `npm run audit:deps`, which fails on high/critical production advisories outside a documented allow-list (currently the Prisma CLI's bundled `mysql2` / `deepmerge-ts`). `prisma` moved to `dependencies` because the image runs it before each deploy.
- **Not done here** (deferred, P70): Turnstile on login after failures, the Playwright E2E journey and k6 load test, uploading Sentry source maps, a log drain beyond Railway's, per-route latency metrics, and slimming the image.
- Tests: retention and notices (10), CSP (4), log redaction (2), Sentry scrubbing (2), client config (2), first admin (3); webapp scrubbing (2).

### Launch checklist status

- [ ] Real inventory imported and reviewed by Elation. **Needs Elation**
- [ ] Moodboard samples and traffic-light thresholds signed off. **Needs Elation**
- [ ] Open questions in [00-decisions.md](00-decisions.md) answered. **Needs Elation**
- [ ] Admin and consultant accounts created with `create-admin` and Admin → Team; seed never run in production (RUNBOOK §1.6).
- [ ] Email deliverability verified on Elation's domain (RUNBOOK §1.3).
- [ ] Backup restore drill against Railway (RUNBOOK §3). Drill tooling verified locally.
- [ ] Privacy policy and terms final, including the 7-day deletion wording the access emails already use. **Needs Elation**
- [ ] Sentry and uptime alerts routed to a named person (RUNBOOK §1.5, §1.7).
