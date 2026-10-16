# Elation X

A private planning studio for clients of **Elation by FMH**, a luxury event and wedding décor house. Clients answer a design questionnaire, get moodboards curated from Elation's real inventory, build a live-priced budget and message their consultant. The Elation team manages client access, inventory prices, inspiration concepts and consultations from an admin console.

Accounts are invite-only. There is no public sign-up.

## Features

**Clients**
- Sign in with an emailed invitation link; access expires after a set period (30 days by default).
- Events: create events and track progress across questionnaire, moodboard and budget.
- Questionnaire: guided brief with conditional questions and "Elation decides" options; answers autosave.
- Moodboards: concepts curated from inventory by Groq (`openai/gpt-oss-120b`), with a rule-based fallback. Answers like "no ceiling décor" are respected.
- Budget estimator: every line priced from current inventory. Traffic light: yellow below 90% of target, green 90–100%, red above 100%. A starter budget can be drafted from any moodboard.
- Quote requests freeze prices, quantities and totals at the moment they are sent.
- Inspiration gallery: browse concepts, see which suit an event, adopt one into the moodboard and budget.
- Live messaging with the Elation team (Supabase Realtime).
- Light and dark themes.

**Admins** (who also act as consultants)
- Overview with key numbers, charts and recent activity.
- Clients: invite, re-send invites, extend or shorten access, revoke and reactivate, assign a consultant.
- Inventory: add, edit, archive and upload photos; edit prices inline with full price history.
- Inspirations: create concepts with images, palette, styles and the inventory they use; publish when ready.
- Consultations: each client's progress, quote requests (new, contacted, closed) and follow-up notes.
- Messages inbox across all clients, updated live.
- Analytics: events by type, budget ranges, popular styles, weekly moodboards and quotes.

## Tech stack

| Part | Technology |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, Radix UI, Zustand, react-hook-form + zod, recharts |
| Backend | Python 3.11+, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, httpx, PyJWT, managed with uv |
| Database, auth, files, realtime | Supabase (Postgres, Auth, Storage, Realtime) |
| AI | Groq API, model `openai/gpt-oss-120b`, strict JSON-schema output |
| Email | Resend |

```
Browser (React)
 ├─ supabase-js ─▶ Supabase Auth       sign-in, set/reset password, session refresh
 ├─ supabase-js ─▶ Supabase Realtime   live messages (row-level security filters them)
 └─ fetch + Bearer token ─▶ FastAPI ─▶ Supabase Postgres
                              ├─▶ Supabase Auth admin API   invites, bans
                              ├─▶ Supabase Storage          inventory and inspiration images
                              ├─▶ Groq                      recommendations
                              └─▶ Resend                    invitation and reset emails
```

The browser never reads or writes tables directly. The only exception is the Realtime subscription to `messages`, protected by row-level security.

## Repository layout

```
.
├── AGENTS.md            # rules and context for coding agents and new developers
├── .env.example         # every environment variable, no secrets
├── backend/             # FastAPI app (see AGENTS.md for the internal layout)
│   ├── app/             # routers, services, schemas, models, seed and scripts
│   ├── alembic/         # database migrations
│   └── tests/
├── frontend/            # React app
│   └── src/             # api, pages, components, hooks, stores, types, lib
└── docs/
    ├── product/         # decision log, backend plan, requirements checklist
    ├── requirements/    # original modular report and questionnaire (.docx)
    ├── reference/       # inventory scans, lookbook, AR set concepts
    └── frontend-build-plan.md
```

## Getting started

### 1. Prerequisites

- Python 3.11+ and [uv](https://docs.astral.sh/uv/)
- Node.js 20+ and npm
- A Supabase project, a Groq API key and a Resend API key

### 2. Configure `.env`

Both apps read a single `.env` in the repository root.

```bash
cp .env.example .env
```

| Variable | Where to find it |
| --- | --- |
| `SUPABASE_URL`, `VITE_SUPABASE_URL` | Supabase → Project Settings → API |
| `SUPABASE_SECRET_KEY` | Project Settings → API Keys → secret key (`sb_secret_…`, server only) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Same page → publishable key (`sb_publishable_…`) |
| `DATABASE_URL` | Supabase → **Connect** → **Session pooler** (port 5432). URL-encode special characters in the password. |
| `SUPERUSER_EMAIL` | The first admin's email |
| `GROQ_API_KEY` | console.groq.com → API Keys. Optional: without it, built-in rules make recommendations. |
| `RESEND_API_KEY`, `EMAIL_FROM` | resend.com. `onboarding@resend.dev` works for testing but only delivers to your own Resend address. |
| `ADMIN_NOTIFICATION_EMAIL` | Optional: receives an email for each quote request |

Only variables starting with `VITE_` reach the browser. `.env` is git-ignored; never commit it.

### 3. Supabase dashboard (one time)

- **Authentication → Sign In / Providers:** turn off "Allow new users to sign up". Keep Email on.
- **Authentication → URL Configuration:** Site URL `http://localhost:5173`; redirect URLs `http://localhost:5173/auth/set-password` and `http://localhost:5173/auth/reset-password`.
- **Authentication → Sign In / Providers → Email:** set *Email OTP Expiration* to `86400` so invite links last 24 hours.

### 4. Backend

```bash
cd backend
uv sync                                         # install pinned dependencies
uv run alembic upgrade head                     # tables, security policies, realtime
uv run python -m app.seed.inventory_seed        # provisional inventory (safe to re-run)
uv run python -m app.scripts.create_superuser   # first admin: prints a one-time set-password link
uv run python -m app                            # API on http://localhost:8787
```

Open the printed link and choose a password to sign in as the admin. Interactive API docs are at <http://localhost:8787/docs> while `NODE_ENV=development`.

### 5. Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

### 6. Try the full journey

1. As the admin, open **Clients → Invite client**. If the email can't be delivered, copy the link from the dialog.
2. Open the link in a private window and set a password. You are now the client.
3. As the client: create an event, answer the questionnaire, curate a moodboard, draft a budget, request a quote and send a message.
4. As the admin: see it arrive in **Messages**, **Consultations** and **Overview**. Edit prices in **Inventory** and add concepts in **Inspirations**.

## Commands

| Where | Command | What it does |
| --- | --- | --- |
| `backend/` | `uv run python -m app` | Run the API with auto-reload |
| `backend/` | `uv run pytest` | Run tests (no database or network needed) |
| `backend/` | `uv run alembic upgrade head` | Apply migrations |
| `backend/` | `uv run alembic revision --autogenerate -m "…"` | Create a migration after editing `models.py` |
| `backend/` | `uv run alembic check` | Confirm models and database match |
| `frontend/` | `npm run dev` | Dev server |
| `frontend/` | `npm run build` | Type-check and production build |
| `frontend/` | `npm run lint` | Lint with oxlint |

## Data you should know about

- **Inventory prices are provisional.** The 34 seeded items use placeholder estimates, not verified Elation prices. Each shows a "Provisional" badge until an admin saves a price. Re-running the seed never overwrites edited prices.
- **The inspiration gallery starts empty.** Concepts are added by admins in the admin console.
- **Budgets use live prices; quotes do not.** Editing a price changes every open budget immediately but never changes a quote that was already requested.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `/api/health` returns `database: unavailable` | Use the **Session pooler** connection string; the direct host is IPv6-only. |
| Invite link shows "Link expired" | Links are single-use and expire. Re-send from **Clients**, and check the OTP expiry setting above. |
| Moodboards say "built from inventory rules" | Groq was unavailable or over its free-tier limit (8k tokens per minute); the rule-based fallback ran. |
| Invitation email never arrives | With `onboarding@resend.dev`, Resend only emails your own address. Verify a domain in Resend for real clients. |
| Port 8787 already in use | Stop the previous API process; an old auto-reload server may still be running. |

## Project status

All planned web features are built. Deferred by decision:

- AR visualisation (Meta Quest 3). The AR pages show empty states.
- Public landing page, booking form and inquiry form.

Known gaps: questionnaire file uploads are hidden until uploads exist; account deletion is handled by an admin after the client requests it in Messages.

Before real clients use it: verify a Resend sending domain, replace provisional prices with Elation's real inventory, and add real inspiration concepts.

## Documentation

- [`AGENTS.md`](./AGENTS.md): conventions, architecture rules and pitfalls for anyone changing the code
- [`docs/product/memory.md`](./docs/product/memory.md): project history, current state and open items (hand-off notes)
- [`docs/product/decision-log.md`](./docs/product/decision-log.md): confirmed product decisions
- [`docs/product/backend-plan.md`](./docs/product/backend-plan.md): data model, endpoints, business rules, pricing assumptions
- [`docs/product/backend-requirements.md`](./docs/product/backend-requirements.md): credentials and configuration checklist

## Brand

| Token | Hex |
| --- | --- |
| Sage | `#9AB1AE` |
| Blush | `#E3BFB9` |
| Beige | `#E1CBAD` |
| Tan | `#CFAE96` |
| Cream | `#FAF3EF` |
| Ink | `#3B3A3F` |

Headings use **Playfair Display**; body text uses **Lato**.
