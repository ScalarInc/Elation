# Elation X — Backend Requirements Checklist

**Revision 2** (2026-10-16). Decisions are confirmed (see [`decision-log.md`](./decision-log.md)); design is in [`backend-plan.md`](./backend-plan.md). This file tracks what must be supplied, configured or answered before and during implementation.
Never put real secrets in this file, in source code, or in commits. Real values go only in the root `.env`, which is git-ignored.

## 1. Credentials and accounts

Status reflects the read-only check of `.env` on 2026-10-16 (values were not printed or stored anywhere else).

| # | Item | Where to get it | Required | Status |
| --- | --- | --- | --- | --- |
| 1 | Supabase project URL | Dashboard → Project Settings → API | Mandatory | ✅ set, format valid |
| 2 | Supabase publishable key (`sb_publishable_…`) | Project Settings → API Keys | Mandatory (frontend auth + Realtime) | ✅ accepted by Supabase Auth |
| 3 | Supabase secret key (`sb_secret_…`) | Same page; server only | Mandatory (admin API, storage) | ✅ accepted by the admin API |
| 4 | Postgres connection string, **Session pooler**, port 5432 | Dashboard → Connect | Mandatory | ✅ host reachable; password verified at first migration |
| 5 | Initial superuser email | You | Mandatory | ✅ set |
| 6 | Groq API key | console.groq.com → API Keys | Mandatory for AI recommendations (rules fallback otherwise) | ✅ accepted; `openai/gpt-oss-120b` available |
| 7 | Resend API key | resend.com → API Keys (sending access is enough) | **Mandatory** (invitations, password reset) | ✅ set, format valid |
| 8 | Resend **verified sending domain** and sender address (`EMAIL_FROM`) | resend.com → Domains, add DNS records at your registrar | **Mandatory before inviting real clients** | ❌ `EMAIL_FROM` is still the placeholder; domain not confirmed |

About item 8: without a verified domain Resend only delivers from `onboarding@resend.dev` to the Resend account owner's own address. Development can proceed (the superuser script also prints the link in the terminal, and admins can copy invite links), but real client invitations need the domain.

## 2. Root `.env` (template: `/.env.example`)

Shared by both apps from the repository root. The backend loads `../.env` with `pydantic-settings`; Vite is pointed at it with `envDir: '..'` and only exposes `VITE_*` variables to the browser. The variable names are unchanged from revision 1, so the existing `.env` stays valid.

| Variable | Used by | Required | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | frontend tooling | default `development` | |
| `FRONTEND_URL` | backend | default `http://localhost:5173` | CORS origin; base for invite/reset redirect links |
| `API_PORT` | backend | default `8787` | Uvicorn port |
| `VITE_API_URL` | frontend | default `http://localhost:8787` | Must match `API_PORT` |
| `SUPABASE_URL` | backend | **mandatory** | Also JWKS location for token verification |
| `SUPABASE_SECRET_KEY` | backend | **mandatory** | Never prefixed with `VITE_` |
| `DATABASE_URL` | backend | **mandatory** | SQLAlchemy + Alembic; Session pooler string |
| `VITE_SUPABASE_URL` | frontend | **mandatory** | Same value as `SUPABASE_URL` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | frontend | **mandatory** | Auth + Realtime only |
| `SUPERUSER_EMAIL` | `create_superuser.py` | **mandatory** | |
| `SUPERUSER_NAME` | `create_superuser.py` | optional | Display name |
| `CLIENT_ACCESS_DEFAULT_DAYS` | backend | default `30` | Confirmed default |
| `GROQ_API_KEY` | backend | mandatory for AI | Missing → rules provider |
| `GROQ_MODEL` | backend | default `openai/gpt-oss-120b` | |
| `GROQ_TIMEOUT_MS` | backend | default `20000` | Fallback to rules on timeout |
| `RESEND_API_KEY` | backend | **mandatory** | |
| `EMAIL_FROM` | backend | **mandatory** | `Elation X <no-reply@verified-domain>` |
| `ADMIN_NOTIFICATION_EMAIL` | backend | optional | Receives quote-request alerts; if empty, no alert email |
| `TEST_DATABASE_URL` | tests | optional | Must differ from `DATABASE_URL`; DB-backed tests are skipped without it |

## 3. Supabase dashboard settings

| Setting | Value | Status |
| --- | --- | --- |
| Authentication → Sign In / Providers → Allow new users to sign up | Off | ✅ verified off |
| Email provider | On | ✅ verified on |
| Authentication → URL Configuration → Site URL | `FRONTEND_URL` | To do |
| Redirect URLs | `FRONTEND_URL/auth/set-password`, `FRONTEND_URL/auth/reset-password` | To do |
| Authentication → Email → link / OTP expiry | 86400 s (24 h) so invitations don't expire in an hour | To do |
| Project Settings → JWT Keys | Asymmetric signing keys preferred (backend verifies via JWKS); legacy secret still works through `auth.get_user` | Check during step 2 |
| Realtime | Enabled (default) | The `messages` publication entry and RLS policies are applied by migration |
| Custom SMTP | Not needed: invitation and recovery emails are sent by the backend through the Resend API | — |

## 4. Open questions (small; defaults apply if unanswered)

1. **Resend domain:** which domain and sender address should invitations come from? (Blocking for real client invites only.)
2. **Python naming:** Python code follows PEP 8 `snake_case` (the framework convention); all API payloads and query parameters are `camelCase`. Default: as stated.
3. **Expiry start:** 30 days counted from account creation, or from the client's first sign-in? Default: from creation.
4. **Thread access:** every admin can read and reply to every client thread. Default: yes (alternative: only the assigned admin).
5. **AR pages:** deferred features keep their existing empty states in the client nav. Default: keep visible (alternative: hide the nav item).

## 5. Data and content needed from Elation

| Item | Needed for | Status |
| --- | --- | --- |
| Structured inventory list (name, category, colour/material, unit, real price, quantity owned, photo) | Replacing provisional prices; better recommendations | Missing. Scans in `docs/reference/inventory/` are photos only. CSV/XLSX can be imported later. |
| Inspiration concepts (name, summary, styles, event types, palette, images, linked items) | Inspiration gallery, adopt flow, concept recommendations | Missing. Gallery is empty until added through the admin CMS. |
| Remaining questionnaire questions | Full brief, recommendation quality | Done: all 134 questions from `docs/requirements/elation-questionnaire.docx` are in `lib/questionnaire/schema.ts`; Elation may want to review wording. |
| About Us copy (Lookbook pp. 1–3) | About page | Not blocking. |

## 6. Local prerequisites

| Tool | Version found | Needed |
| --- | --- | --- |
| Python | 3.11.9 | ≥ 3.11 ✅ |
| uv | 0.9.15 | ✅ |
| Node | 22.23.1 | ✅ (frontend) |

## 7. Known frontend gaps carried into implementation

- Loading and missing events both render "Event not found" (`useResolvedEvent`).
- Budget classification duplicated in `BudgetPage` and `BudgetListPage` with the old 1.15 / 0.7 thresholds.
- Questionnaire answers and consent stored only in localStorage.
- Signup tab, invitation-code field and Google/Apple buttons do nothing and will be removed.
- Messages page has typing, receipts, attachment, call and emoji controls that will be removed.
- No admin pages beyond placeholders; no set-password, reset-password or access-expired screens.
