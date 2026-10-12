# Step 14 — Deployment, security & operations

**Owner:** @Safwan · **Estimate:** 2–3 days (staging early, production at the end) · **Depends on:** Step 1 for staging; everything for production

## Environments

| Env | Web | API | DB | Storage | Deploys from |
| --- | --- | --- | --- | --- | --- |
| local | Vite :5173 | :4000 | Docker Postgres | R2 dev bucket (or MinIO in Docker) | — |
| staging | `staging.elationx.com` | `api.staging.elationx.com` | Neon branch `staging` | `elation-staging-*` buckets | `main` (auto) |
| production | `app.elationx.com` | `api.elationx.com` | Neon `main` | `elation-prod-*` buckets | Git tag `v*` (manual approval) |

Domains are placeholders — ❓ **Needs Elation**: final domain.

Hosting ([D2](00-decisions.md#d2-hosting--railway-or-render--neon-or-railway-postgres--cloudflare-r2)):

- **API** — Railway (or Render) service from `server/Dockerfile` (multi-stage, `node:22-slim`, non-root user). Health check `/readyz`. Starts with 1 instance (512 MB–1 GB). Websockets supported natively.
- **Web** — static `webapp/dist` on Cloudflare Pages (or Railway static). SPA fallback to `index.html`. Long-cache hashed assets.
- **Database** — Neon Postgres 16, region close to Pakistan users (e.g. AWS `ap-south-1` / Singapore), pooled connection string for the app, direct string for migrations.
- **Storage** — Cloudflare R2: private bucket + public bucket on `cdn.elationx.com`.
- **Email** — Resend with SPF/DKIM/DMARC on the sending domain.

## Release pipeline

1. CI (Step 1) green on the PR.
2. Merge to `main` → GitHub Action:
   `npx prisma migrate deploy` against staging → deploy API → deploy web → smoke tests (`/readyz`, login as seeded staging user, `GET /events`).
3. Tag `vX.Y.Z` → same against production after manual approval in GitHub Environments.
4. Migrations are **expand → migrate → contract**: add columns/tables first, deploy code that writes both, backfill, then drop old in a later release. No destructive migration in the same release as the code that stops using the column.

## Security baseline

| Area | Measure |
| --- | --- |
| Transport | HTTPS only, HSTS (via `@fastify/helmet`) |
| Headers | CSP on the web app (self + CDN + R2 domains), `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin` |
| CORS | Only `WEB_ORIGIN`, `credentials: true` |
| Auth | Step 3 checklist (argon2id, rate limits, hashed tokens, session revocation, Origin check) |
| Authorization | Policy matrix tests in CI for every route |
| Input | zod on every route; Prisma parameterises queries; chat rendered as text |
| Uploads | Type/size limits, presigned URLs, private bucket, EXIF stripped |
| Secrets | Platform env vars only; never in the repo; rotated when someone leaves |
| PII | Pino `redact` for email/phone/password/token/cookie; Sentry `beforeSend` scrubs the same |
| Dependencies | Dependabot weekly; `npm audit --omit=dev` in CI (fail on high) |
| Data retention | Expired clients' data kept 12 months then anonymised by a job (❓ **Needs Elation**: retention period) |
| Bot protection | Turnstile on public inquiry form and login after 3 failures |

## Backups & recovery

- Neon point-in-time restore (7 days on the paid plan) + a nightly `pg_dump` to a separate R2 bucket kept 30 days (job in pg-boss or a GitHub Actions cron).
- R2 private bucket: object versioning on; lifecycle deletes old versions after 30 days.
- Restore drill once before launch: restore last night's dump into a Neon branch and run the smoke tests against it. Document the steps in `server/RUNBOOK.md`.

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
