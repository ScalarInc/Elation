# Elation X — Runbook

How to set up, deploy, back up and fix Elation X in staging and production. Design and reasoning: [`docs/step-14-deploy-ops.md`](../docs/step-14-deploy-ops.md).

One Railway project, two environments (`staging`, `production`). Each has one app service (web + API, built from the root `Dockerfile`) and one Postgres 16. Files are in Cloudflare R2, email goes through Resend, errors go to Sentry.

---

## 1. First-time setup

Do this once per environment (`staging` first). Names below use `prod`; use `staging` for the other one.

### 1.1 Cloudflare R2

1. Create the buckets `elation-prod-private` and `elation-prod-public`, plus one shared `elation-backups` bucket for database dumps.
2. **Public bucket:** Settings → Public access → enable the r2.dev URL (or connect a custom domain later). That URL is `R2_PUBLIC_BASE_URL`.
3. **Private bucket:**
   - CORS: paste [`deploy/r2-cors.json`](deploy/r2-cors.json) with `AllowedOrigins` set to the app's URL (`https://elation-prod.up.railway.app`). Browsers upload straight to this bucket, so uploads fail without it.
   - Object versioning on, plus a lifecycle rule that deletes noncurrent versions after 30 days.
4. **Backups bucket:** lifecycle rule that deletes objects under `postgres/` after 35 days (the backup job also prunes at 30).
5. API tokens (R2 → Manage API tokens), "Object Read & Write":
   - one for the app, scoped to the two `elation-prod-*` buckets → `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`
   - one for backups, scoped to `elation-backups` only → GitHub secrets (§1.4)

### 1.2 Railway

1. New project → add **PostgreSQL** (version 16). In the database service turn on **Backups** (daily, keep 7+).
2. Add a service from the GitHub repo and name it `elation-prod` (`elation-staging` in staging). It picks up [`railway.json`](../railway.json): Dockerfile build, `npx prisma migrate deploy` before each deploy, health check `/api/v1/readyz`.
3. Settings → Source: **turn off automatic deploys from GitHub**. GitHub Actions deploys instead, after CI passes (§2).
4. Settings → Networking → generate a domain (`*.up.railway.app`).
5. Variables on the app service:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` (staging too: it turns on the production checks) |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference variable, private network) |
| `APP_URL`, `WEB_ORIGIN` | `https://elation-prod.up.railway.app` |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | from §1.1 |
| `R2_PRIVATE_BUCKET`, `R2_PUBLIC_BUCKET` | `elation-prod-private`, `elation-prod-public` |
| `R2_PUBLIC_BASE_URL` | the public bucket's r2.dev URL |
| `RESEND_API_KEY`, `MAIL_FROM` | §1.3. Without a key, **no email is sent** (invite links can still be copied from the admin console) |
| `SENTRY_DSN`, `SENTRY_WEB_DSN`, `SENTRY_ENVIRONMENT` | §1.5; environment = `staging` / `production` |

Optional: `LOG_LEVEL` (default `info`), `DEFAULT_CLIENT_ACCESS_DAYS` (90), `EXPIRED_DATA_RETENTION_DAYS` (7), `SESSION_TTL_DAYS` (14). `PORT`, `HOST` and `SERVE_WEBAPP_DIST` come from the image. `RELEASE` is set by the deploy workflow.

The server checks its configuration on start and refuses to boot when something required is missing. The reason shows in the deploy logs.

### 1.3 Resend

Add and verify Elation's sending domain (SPF + DKIM records at the DNS host). `MAIL_FROM="Elation X <studio@elationbyfmh.com>"`. Until the domain is verified, staging can use Resend's test sender `onboarding@resend.dev`, which only delivers to the Resend account owner's address. **Before launch:** send an invite to a Gmail address and check it lands in the inbox.

### 1.4 GitHub

Settings → Environments:

| Environment | Protection | Secrets | Variables |
| --- | --- | --- | --- |
| `staging` | none | `RAILWAY_TOKEN` (Railway project token for *staging*), `SMOKE_EMAIL`, `SMOKE_PASSWORD` | `RAILWAY_SERVICE=elation-staging`, `APP_URL` |
| `production` | **Required reviewers** (at least one person who isn't the author); deployment tags `v*` | `RAILWAY_TOKEN` (token for *production*), `SMOKE_EMAIL`, `SMOKE_PASSWORD` | `RAILWAY_SERVICE=elation-prod`, `APP_URL` |
| `backups` | none | `BACKUP_DATABASE_URL`, `BACKUP_PASSPHRASE`, `BACKUP_R2_ACCESS_KEY_ID`, `BACKUP_R2_SECRET_ACCESS_KEY` | `R2_ACCOUNT_ID`, `BACKUP_BUCKET=elation-backups`, `PG_MAJOR=16` |

- Railway project tokens: Project → Settings → Tokens, one per environment.
- `SMOKE_EMAIL` / `SMOKE_PASSWORD`: a consultant account just for smoke tests. Create it from Admin → Team after §1.6. Leave both empty to skip the sign-in check.
- `BACKUP_DATABASE_URL`: the production Postgres's `DATABASE_PUBLIC_URL` (Railway TCP proxy). Better: create a read-only role and use its credentials.
- `BACKUP_PASSPHRASE`: a long random passphrase. **Also store it in the team password manager.** Without it the backups can't be read.

Settings → Branches: protect `main` (pull request + CI green).

### 1.5 Sentry (optional, recommended)

Create two projects: `elation-api` (Node) and `elation-web` (Browser JavaScript). Their DSNs go in `SENTRY_DSN` and `SENTRY_WEB_DSN`. The browser DSN is public by design: the web app fetches it from `GET /api/v1/client-config` and loads the Sentry SDK only when it's set. Route alerts (new issue, spike) to a person. Nothing personal is sent: no user, IP, cookies, headers, bodies or query strings, and emails or phone numbers in messages are masked.

### 1.6 First deploy and the first admin

1. Deploy (§2). The pre-deploy step creates the tables on the empty database.
2. Create the first admin. It only works while no active admin exists:
   ```bash
   railway run --service elation-prod -- node dist/create-admin.js --email owner@elationbyfmh.com --name "Owner Name"
   ```
   If `railway run` can't reach the private database from your machine, open a shell in the service instead (`railway ssh --service elation-prod`) and run `node dist/create-admin.js …` there. The command prints a one-time activation link, valid for 48 hours. Open it and choose a password.
3. Sign in, then invite consultants and admins from **Admin → Team**, and set the settings in **Admin → Settings**.
4. **Never run the seed (`db:seed`) against staging or production.** It loads demo accounts with a known password.

### 1.7 Uptime monitor

Use any external monitor (Better Stack, UptimeRobot) to check every minute:
- `https://elation-prod.up.railway.app/api/v1/readyz`: expect 200 and `"database":"up"`
- `https://elation-prod.up.railway.app/`: expect 200

Send alerts to a named person by email or WhatsApp, not just a shared inbox.

---

## 2. Deploying

| What | How |
| --- | --- |
| Staging | Merge to `main`. When CI passes, **Deploy** runs automatically for that commit. |
| Production | Tag a commit on `main` that passed CI: `git tag v1.2.0 && git push origin v1.2.0`. A reviewer approves the `production` environment in the Actions run. |
| Re-run / pick a commit | Actions → Deploy → Run workflow → choose environment and ref. |

Each deploy runs these steps in order:
1. Sets `RELEASE` to the commit.
2. `railway up` builds the image.
3. Railway runs `prisma migrate deploy`. If it fails, the deploy stops and the old version keeps serving.
4. Railway starts the new container and moves traffic once `/readyz` is healthy.
5. The workflow runs [`scripts/smoke.mjs`](../scripts/smoke.mjs) against the URL.

Run the smoke test yourself any time: `node scripts/smoke.mjs https://elation-prod.up.railway.app`.

### Migrations

Always **expand → migrate → contract**:
1. A release adds the new column or table. It must be nullable or have a default, and the old code must keep working with it.
2. The code starts writing it, and a backfill runs if needed.
3. A *later* release removes what is no longer used.

Never drop or rename something in the same release as the code that stops using it. During a deploy the old container still serves traffic after the migration has run.

### Rollback

- **Code:** Actions → Deploy → Run workflow → `production` + the previous tag. Or use Railway → Deployments → the previous deploy → Redeploy. That is faster, but it skips the CI check.
- **Database:** migrations only move forward. Because they are additive, older code runs fine on the newer schema. Restore from a backup (§3) only for data loss, never to undo a migration.

---

## 3. Backups and restore

| Copy | Where | Kept |
| --- | --- | --- |
| Railway volume backups | Railway → Postgres → Backups | per Railway setting |
| Nightly `pg_dump`, encrypted (gpg AES-256) | R2 `elation-backups/postgres/elation-<UTC time>.dump.gpg` | 30 days |
| Uploaded files | R2 private bucket, object versioning | old versions 30 days |

The nightly job ([`.github/workflows/backup.yml`](../.github/workflows/backup.yml), 02:30 PKT) fails if a dump is tiny or can't be read back. GitHub emails the people watching the repo when a scheduled run fails.

### Restore a dump

Use a `postgres:16` client, matching the server's major version. A newer `pg_restore` writes settings that Postgres 16 rejects.

```bash
aws s3 cp s3://elation-backups/postgres/elation-2026-10-15T213000Z.dump.gpg . \
  --endpoint-url https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
gpg --decrypt --output restore.dump elation-2026-10-15T213000Z.dump.gpg      # asks for BACKUP_PASSPHRASE
docker run --rm -v "$PWD:/w" postgres:16 pg_restore --no-owner --no-privileges --exit-on-error \
  --dbname "postgresql://USER:PASS@HOST:PORT/DBNAME" /w/restore.dump
rm restore.dump *.dump.gpg
```

Restore into an **empty** database. To replace production:
1. Restore into a new Railway Postgres.
2. Check it (below).
3. Point the app's `DATABASE_URL` at it and redeploy.

Keep the old database until you're sure.

### Restore drill (before launch, then every quarter)

1. Railway → add a throwaway Postgres 16 in the staging environment.
2. Restore last night's dump into it (above).
3. Spot-check the data: `SELECT count(*) FROM "User"; SELECT count(*) FROM "Event"; SELECT max("createdAt") FROM "Message";`
4. Point a staging deploy at it (temporarily change `DATABASE_URL`), run `node scripts/smoke.mjs <staging-url>`, then point it back and delete the throwaway database.
5. Write the date and the result here:

| Date | Dump | Result | By |
| --- | --- | --- | --- |
| 2026-10-15 | local dev database (dump → gpg → restore into an empty Postgres 16) | row counts match; done locally, not yet against Railway | @Safwan |

---

## 4. Background jobs

All jobs run inside the app process (no separate worker). With more than one instance they still run safely: each step claims its rows first.

| Every | Job | Log line |
| --- | --- | --- |
| hour | Mark clients whose access has ended as expired; end their sessions | `sweep: clients expired` |
| hour | Access emails: 7 days and 1 day before the end, and the day it ends (the client's consultant gets a copy) | `sweep: access notices sent` |
| hour | **Data-retention purge**: clients expired more than `EXPIRED_DATA_RETENTION_DAYS` (7) ago | `retention purge: client data deleted` |
| hour | Remove uploads that were started but never finished (24 h) | `sweep: abandoned uploads removed` |
| minute | Unread-message emails | `unread digests sent` |

A failing job logs `sweep failed: <name>` and goes to Sentry. The next run retries.

### What the purge deletes

When a client's access has been over for 7 days and nobody extended it, the purge deletes:
- their events, with questionnaire answers and history, moodboards, budgets and quotes, and AR sets
- chat threads and messages, including attachments staff sent in them
- uploaded files, including the bytes in R2
- consultant notes, consents, sessions, invites and reset links

The account row stays as an anonymous placeholder: name "Former client", the email replaced, every contact field cleared. That way audit entries ("who extended whom, when") still make sense, but they lose their before/after details. A converted inquiry from that person is anonymised too. The email address is free again, so the person can be invited fresh, though they start from scratch (owner answer A5).

Extending access **before** day 7 keeps everything. Staff see "data will be deleted on …" on the client's page in the admin console.

**There is no undo** apart from restoring a backup (§3). If a purge was a mistake, restore the night-before dump into a separate database and copy the client's rows across by hand. Do this soon: dumps are kept 30 days.

---

## 5. When something breaks

**Site down / 502.**
1. Check Railway → service → Deployments. Is the latest one crashed or still building? Open its logs.
2. If the latest deploy is bad, roll back (§2).
3. Check `/api/v1/readyz`. If the database shows `down`, check the Postgres service (crashed? volume full?).

**"Invalid environment configuration" in the deploy logs.** A variable is missing or wrong. The message names it. Fix it in Railway → Variables, which redeploys.

**Migration failed in pre-deploy.** The old version keeps serving. Read the error in the deploy logs. A migration that fails halfway is recorded in `_prisma_migrations` as failed. Fix the cause, then mark it with `railway run -- npx prisma migrate resolve --rolled-back <migration_name>` and redeploy. Never edit a migration that has already run anywhere.

**Emails not arriving.**
1. Check Resend → Logs: was it sent, bounced, or never sent?
2. In the app logs, look for `invite email failed` or `access notice email failed`.
3. If the key is missing, nothing is sent. Invite links can still be copied in the admin console and shared on WhatsApp.

**Uploads fail ("Can't reach storage").** Usually the private bucket's CORS: `AllowedOrigins` must exactly match the app's URL, scheme included. Then check the R2 token hasn't expired and the CSP (`connect-src`) lists the R2 host (it is built from `R2_ACCOUNT_ID`).

**Chat not live** (messages only appear on refresh). Websockets need a direct database connection for `LISTEN`. If `DATABASE_URL` goes through a pooler, set `DATABASE_LISTEN_URL` to the direct URL. The log line to look for is `realtime listener lost its connection`.

**Someone needs access now.** Admin → Clients → the client → Extend. Consultants can extend by up to 30 days at a time.

**A leaked account or secret.**
- Account: Admin → Clients → Close account. This ends every session at once.
- Secret: rotate it (§6).

---

## 6. Secrets

- They live only in Railway variables and GitHub environment secrets, never in the repo.
- Rotate when someone with access leaves, and after any suspected leak:
  - **R2 keys:** create the new token, update the variables, redeploy, delete the old token.
  - **Resend:** same steps.
  - **Railway project tokens:** regenerate, then update the GitHub secret.
  - **Backup passphrase:** change the secret. Old dumps still need the old passphrase, so keep it in the password manager until those dumps expire (30 days).
  - **Database password:** Railway → Postgres → regenerate. The reference variable updates the app on redeploy. Update `BACKUP_DATABASE_URL`.
- Signing out every user, if a session leak is suspected: `railway run -- npx prisma db execute --stdin <<< 'DELETE FROM "Session";'`

---

## 7. Dependencies

- Dependabot opens grouped update PRs every Monday. Merge them once CI passes. Major versions come one at a time, so read their changelogs.
- CI runs `npm run audit:deps`, which fails on high or critical advisories in production dependencies. Accepted exceptions, with reasons, are listed in [`scripts/audit.mjs`](../scripts/audit.mjs). Re-check them on every Prisma upgrade.
