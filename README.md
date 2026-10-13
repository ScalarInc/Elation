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
└── frontend/                        # Vite + React + TypeScript + TailwindCSS
    └── src/
        ├── api/                     # data access layer (backend not connected yet)
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

## Frontend: run locally

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173/>.

Other scripts: `npm run build` (type-check + production build), `npm run lint` (oxlint).

## Backend: run locally

Requires Python 3.11+ and [uv](https://docs.astral.sh/uv/). Configuration comes from the root `.env` (template: `.env.example`).

```bash
cd backend
uv sync                      # create .venv and install pinned dependencies
uv run alembic upgrade head  # create/update database tables
uv run python -m app.seed.inventory_seed       # provisional inventory prices (safe to re-run)
uv run python -m app.scripts.create_superuser   # first admin: prints a one-time set-password link
uv run python -m app         # API on http://localhost:8787 (docs at /docs)
uv run pytest                # tests (no database needed)
```

Health check: <http://localhost:8787/api/health>.

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
