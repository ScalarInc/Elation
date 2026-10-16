# Elation X

Client-facing webapp for **Elation by FMH**: an event mood-board, budget estimator, and AR visualisation platform for luxury weddings.

## Repository layout

```
.
├── docs/
│   ├── frontend-build-plan.md       # page-by-page build plan and data-flow rules
│   ├── product/
│   │   ├── decision-log.md          # confirmed product/backend decisions (append-only)
│   │   ├── backend-plan.md          # backend architecture, tables, endpoints, pricing
│   │   └── backend-requirements.md  # credentials, .env outline, open decisions
│   ├── requirements/
│   │   ├── elation-x-modular-report.docx   # scope, timeline, module breakdown
│   │   └── elation-questionnaire.docx      # 134-question conditional client brief
│   └── reference/
│       ├── ar-sets/                 # concept files for the 3 AR visualisation sets
│       ├── inventory/               # scanned physical inventory (chairs, sofas, décor)
│       └── lookbook/                # FMH Lookbook (About Us + inspiration source)
├── backend/                         # FastAPI + SQLAlchemy + Alembic (Python)
│   ├── app/                         # routers, services, schemas, models
│   ├── alembic/                     # database migrations
│   └── tests/
└── frontend/                        # Vite + React + TypeScript + TailwindCSS
    └── src/
        ├── api/                     # data access layer (calls the backend)
        ├── assets/                  # brand/ and images/
        ├── components/              # ui/ primitives + feature folders
        ├── hooks/                   # shared React hooks
        ├── layouts/                 # page shells (client, admin, public)
        ├── lib/                     # pure helpers, questionnaire schema/derivations
        ├── pages/                   # grouped by route area
        ├── routes/                  # route guards
        ├── stores/                  # Zustand stores
        └── types/                   # shared domain types
```

## Local setup

The app has two parts that run side by side: a **FastAPI backend** (`backend/`, Python) and a **React frontend** (`frontend/`, Vite). Both read one `.env` at the repo root. Data, sign-in, live messaging and images live in **Supabase**; AI recommendations use **Groq**; emails go through **Resend**.

### 1. Prerequisites

- Python 3.11+ and [uv](https://docs.astral.sh/uv/)
- Node.js 20+ and npm
- A Supabase project, a Groq API key and a Resend API key

### 2. Configure `.env`

```bash
cp .env.example .env    # then fill in the values
```

| Variable | Where to find it |
| --- | --- |
| `SUPABASE_URL`, `VITE_SUPABASE_URL` | Supabase → Project Settings → API |
| `SUPABASE_SECRET_KEY` | Project Settings → API Keys → secret key (`sb_secret_…`, server only) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Same page → publishable key (`sb_publishable_…`) |
| `DATABASE_URL` | Supabase → **Connect** → **Session pooler** (port 5432). URL-encode special characters in the password. |
| `SUPERUSER_EMAIL` | The first admin's email |
| `GROQ_API_KEY` | console.groq.com → API Keys (optional: without it, built-in rules make recommendations) |
| `RESEND_API_KEY`, `EMAIL_FROM` | resend.com. `onboarding@resend.dev` works for testing but only delivers to your own Resend email. |

Never commit `.env`; it is git-ignored.

### 3. Supabase dashboard (one time)

- **Authentication → Sign In / Providers:** turn **off** "Allow new users to sign up" (accounts are created by admins). Keep Email on.
- **Authentication → URL Configuration:** Site URL `http://localhost:5173`; redirect URLs `http://localhost:5173/auth/set-password` and `http://localhost:5173/auth/reset-password`.
- **Authentication → Sign In / Providers → Email:** set *Email OTP Expiration* to `86400` so invite links last 24 hours.

### 4. Backend

```bash
cd backend
uv sync                                         # install pinned dependencies
uv run alembic upgrade head                     # create tables, security policies, realtime
uv run python -m app.seed.inventory_seed        # provisional inventory (safe to re-run)
uv run python -m app.scripts.create_superuser   # first admin: prints a one-time set-password link
uv run python -m app                            # API on http://localhost:8787 (docs at /docs)
```

Open the printed link, choose a password, and you're signed in as the admin.

### 5. Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

Other scripts: `npm run build` (type-check + production build), `npm run lint` (oxlint).

### 6. Try it end to end

1. Sign in as the admin → **Clients → Invite client**. If the email can't be delivered, copy the link from the dialog.
2. Open the link in a private window, set a password → you're the client.
3. As the client: create an event, answer the questionnaire, curate a moodboard, draft a budget, request a quote, send a message.
4. As the admin: watch it arrive in **Messages**, **Consultations** and **Overview**; edit prices in **Inventory**; add concepts in **Inspirations**.

### Tests

```bash
cd backend && uv run pytest        # no database or network needed
```

They cover budget maths and the traffic light, quote snapshots, access expiry, role and ownership checks, recommendation validation and fallback, the Groq privacy payload, and messaging validation.

### Troubleshooting

| Symptom | Fix |
| --- | --- |
| `/api/health` says `database: unavailable` | Use the **Session pooler** connection string; the direct host is IPv6-only. |
| Invite link shows "Link expired" | Links are single-use and expire (see step 3). Re-send from **Clients**. |
| Recommendations say "built from inventory rules" | Groq was unavailable or over its free-tier limit (8k tokens/min); the rules fallback was used. |
| Invitation email not received | With `onboarding@resend.dev` Resend only emails your own address; verify a domain for real clients. |
| Adding a column/table | Edit `backend/app/models.py`, then `uv run alembic revision --autogenerate -m "…"` and `uv run alembic upgrade head`. New tables must also be added to the RLS list (a test enforces this). |

## Where things live

- `backend/app/routers/`: HTTP endpoints (thin) · `services/`: business logic · `schemas/`: request/response models (camelCase JSON) · `models.py`: database tables
- `frontend/src/api/`: all backend calls · `pages/`: screens · `components/`: UI · `stores/`, `hooks/`: shared state
- Product decisions and the full plan: `docs/product/`

## Brand system

| Token | Hex |
| --- | --- |
| Sage | `#9AB1AE` |
| Blush | `#E3BFB9` |
| Beige | `#E1CBAD` |
| Tan | `#CFAE96` |
| Cream | `#FAF3EF` |
| Ink | `#3B3A3F` |

- Headings: **Playfair Display**
- Body: **Lato**
