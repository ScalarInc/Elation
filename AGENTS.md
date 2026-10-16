# AGENTS.md

Guidance for coding agents and new developers working on Elation X. Read this before changing code. Setup and product overview are in [`README.md`](./README.md); product decisions are in [`docs/product/decision-log.md`](./docs/product/decision-log.md).

## What this is

A side-project MVP, not an enterprise system. Keep changes small and readable. Do not add infrastructure (Sentry, Cloudflare R2, CI/CD pipelines, queues, microservices) or new abstractions unless asked.

- `backend/`: FastAPI + Pydantic v2 + SQLAlchemy 2 + Alembic, Python 3.11+, managed with uv.
- `frontend/`: React 19 + TypeScript + Vite + Tailwind.
- Supabase provides Postgres, Auth, Storage and Realtime. Groq (`openai/gpt-oss-120b`) provides recommendations. Resend sends emails.
- One `.env` at the repo root is read by both apps. Never print, log or commit its values.

## Commands

Run from the folder shown. The development machine is Windows with PowerShell: chain commands with `;`, not `&&`.

| Task | Command |
| --- | --- |
| Backend tests | `backend/` → `uv run pytest -q` |
| Run API | `backend/` → `uv run python -m app` (port 8787) |
| New migration | `backend/` → `uv run alembic revision --autogenerate -m "..."` then `uv run alembic upgrade head` |
| Model/DB drift check | `backend/` → `uv run alembic check` |
| Frontend build (includes type-check) | `frontend/` → `npm run build` |
| Frontend lint | `frontend/` → `npm run lint` |

Before reporting a change as done: backend tests pass, `npm run build` passes, and lint has no new warnings in the files you touched. Delete any `dist/` folder and temporary scripts you created.

## Backend layout and rules

```
backend/app/
├── main.py           # app factory: CORS, error handlers, router registration
├── config.py         # Settings (pydantic-settings) from ../.env
├── db.py             # engine, get_db (request session), new_session (scripts)
├── deps.py           # CurrentUser / CurrentClient / CurrentAdmin, token verification
├── errors.py         # ApiError and the JSON error shape
├── models.py         # all SQLAlchemy tables
├── constants.py      # allowed values for text columns (mirrored by CHECK constraints)
├── routers/          # HTTP layer only: parse input, call a service, return a schema
├── schemas/          # Pydantic request/response models
├── services/         # business logic (no FastAPI objects)
│   └── recommendations/  rules.py, prompt.py, groq_provider.py, service.py
├── seed/inventory_seed.py
└── scripts/create_superuser.py
```

- **Naming.** Python is PEP 8 (`snake_case` functions and fields, `PascalCase` classes). Every JSON field and query parameter is camelCase. Do this by inheriting from `schemas.base.CamelModel`, never by writing camelCase Python attributes. Tables and columns are snake_case.
- **Thin routers.** Put logic in `services/`. Routers check access through dependencies and translate to and from schemas.
- **Errors.** Raise `ApiError(status, CODE, message)` for expected failures. Responses always look like `{"error": {"code", "message", "details"}}`; validation errors return 400.
- **Access.** Use `CurrentClient` for client-only routes, `CurrentAdmin` for `/api/admin/*`, `CurrentUser` for either. Clients must only see their own data: load events with `services.events.get_own_event`, which returns 404 for another client's id. Expired or revoked clients are rejected in `deps.get_current_user`.
- **Money** is integer PKR (`*_pkr` columns). Never use floats for prices; a test enforces integer money columns.
- **Names are never unique.** Only ids, `inventory_items.sku` and `inspirations.slug` are unique. A test enforces this; don't add unique constraints on names.
- **Text enums** are plain text columns with CHECK constraints built from `constants.py`. Changing allowed values needs a migration and matching frontend types.

### Database and security

- Every table has row-level security enabled, and browser roles (`anon`, `authenticated`) have no privileges. The backend connects as the database owner and bypasses RLS.
- `messages` is the only exception: `authenticated` may SELECT through the `messages_select_own_or_admin` policy so Realtime can deliver rows. Never grant INSERT, UPDATE or DELETE to browser roles. Sends go through the API.
- **Adding a table:** in the new migration, enable RLS and `revoke all ... from anon, authenticated`, the same as in `_apply_security()` in the initial migration. `tests/test_schema.py::test_every_table_gets_row_level_security` currently compares against the initial migration's `APP_TABLES`, so it will fail for a new table: update that test to include tables secured in later migrations rather than weakening it.
- Migrations live in `backend/alembic/versions/`. The database URL comes from settings in `alembic/env.py`; never put it in `alembic.ini`.
- Tests never touch the real database. `tests/conftest.py` sets dummy env values; `tests/helpers.py` provides `FakeSession`, `make_profile`, `make_admin`, locally signed tokens (`use_local_jwks`, `auth_header`) and `client_with`.

## Business rules that must not drift

- **Traffic light** (`services/budget.py::classify_budget`): `red` if total > target, `green` if 90% ≤ total ≤ 100%, `yellow` below 90%, `noTarget` when no target. No tolerance. The frontend copy in `frontend/src/lib/budget.ts` must stay identical.
- **Prices come from the database.** Budget totals always use the current `inventory_items.price_pkr`. The model (Groq) never sets or changes a price.
- **Quotes are frozen.** `create_quote_request` copies item, unit price, quantity and subtotal into `lines_snapshot`. Never recompute an existing quote from live prices.
- **Price edits** go through `services/inventory.change_price`, which writes `inventory_price_history` and clears `is_provisional_price`.
- **Inventory seed** inserts by SKU and skips existing rows. It must never overwrite an admin-edited price.
- **Access expiry** defaults to `CLIENT_ACCESS_DEFAULT_DAYS` (30). Revoking also bans the Supabase user (`supabase_admin.set_banned`).
- **Invitations** use Supabase `generate_link` (Supabase sends no email) and Resend for delivery. If email fails, the account still exists and the admin gets the link to share. No temporary passwords exist anywhere.

## Recommendations and privacy

- Pipeline in `services/recommendations/service.py`: score candidates per setup "slot" (`rules.py`) → ask Groq (`groq_provider.py`) → validate (only offered candidates, quantities clamped, core slots filled) → trim optional slots to fit the budget → save.
- Any Groq problem (no key, timeout, HTTP error, invalid output) falls back to the rules provider. Keep that fallback working; the app must never depend on Groq being up.
- **Privacy:** the payload is built only in `prompt.py` from a whitelist. Never send names, emails, phone numbers, partner or emergency contacts, venue or concept names, exact dates (month only), uploads or messages. Free text passes through `redact()`. `tests/test_recommendations.py` checks this; extend it if you add fields.
- Groq's free tier allows about 8,000 tokens per minute. Payloads use short candidate refs (`c1`, `c2`…) and a capped `max_completion_tokens`. Check the size before adding fields.
- User-facing copy says "Elation curated" or "Elation decides", never "AI decides".

## Frontend layout and rules

```
frontend/src/
├── api/         # index.ts (client endpoints), admin.ts (admin endpoints), client.ts (fetch + token)
├── types/       # index.ts (domain types), admin.ts (admin types)
├── pages/       # one folder per route area; admin/ for the console
├── components/  # ui/ primitives (shadcn-style, kebab-case files) + feature folders (PascalCase files)
├── hooks/       # useCurrentUser, useResolvedEvent, useMessageThread, useAdoptInspiration…
├── stores/      # authStore (session), questionnaireStore (answers + autosave)
├── lib/         # pure helpers: format, budget, auth, supabase, questionnaire/
├── layouts/     # ClientLayout, AdminLayout, AuthLayout, PublicLayout
└── routes/      # ProtectedRoute (role guard), RootRedirect
```

- **All backend calls go through `src/api/`.** Pages and components never call `fetch` directly. `apiRequest` attaches the Supabase access token and turns error responses into `ApiRequestError` (with `status` and `code`).
- **Supabase in the browser** (`lib/supabase.ts`) is for auth and the Realtime subscription only, never for reading or writing tables.
- Types mirror backend JSON (camelCase). When an API shape changes, update `types/` and the mapping in `api/` (for example `withCover`, `withPreview`, `toInspiration`, `toSnapshot`) in the same change.
- Event pages use `useResolvedEvent`: `undefined` means loading, `null` means not found or not yours. Show `PageLoader` for `undefined`.
- **Questionnaire never asks twice.** The backend pre-fills Event Basics (type, name, date, guests, venue) from the event (`services/events.answers_with_event_defaults`). In `lib/questionnaire/schema.ts`, `AREA_GATES` makes "Which areas need décor?" answer the matching yes/no questions (stage, ceiling, entrance…), which are then hidden. New yes/no questions tied to an area belong in `AREA_GATES`.
- Use the existing UI primitives in `components/ui/` and theme tokens (`bg-surface`, `text-text`, `text-muted`, `accent`…) so dark mode keeps working. Don't add new UI libraries.
- camelCase for variables and functions; PascalCase for components and types.
- Every list needs loading, empty and error states. Mutations confirm with a toast and show the backend's error message on failure.

## Known pitfalls

- **Supabase secret keys are rejected from browser-like clients.** Requests with a browser User-Agent get 401. Server code with httpx is fine; for ad-hoc PowerShell checks pass a non-browser `-UserAgent`.
- **Clock skew:** token verification allows 60 seconds of leeway (`deps.verify_access_token`). Don't remove it; without it fresh sign-ins fail with "token not yet valid".
- **Use the Session pooler URL** for `DATABASE_URL`. The direct host is IPv6-only and unreachable on many networks.
- **Stale servers:** `python -m app` runs with auto-reload and can leave a child process holding port 8787 with old code. If a new endpoint returns 404, check what is listening on the port.
- **Resend test sender** (`onboarding@resend.dev`) only delivers to the account owner's address. Invite failures in development are expected; the admin dialog shows a copyable link.
- **Windows console encoding:** model output can contain characters cp1252 can't print. Set `PYTHONIOENCODING=utf-8` for scripts that print Groq output.
- **Line endings:** files may be LF or CRLF. When doing scripted find-and-replace across multiple lines, account for both.

## Verifying against real services

Unit tests cover the logic. For changes involving auth, RLS, Realtime, Storage or Groq, also check against the real project with a throwaway client, and delete it afterwards (`supabase_admin.delete_user(id)` cascades to the profile and all of its data). Never leave test users, inventory or concepts in the database.

## Out of scope unless asked

AR visualisation (Meta Quest 3), the public landing page, the public booking and inquiry forms, payments, and production deployment. The related pages and `TODO(backend)` handlers are intentional placeholders.

## Git

- Commit messages: one short line in conventional format, e.g. `feat: add quote status filter`, `fix: …`, `docs: …`, `test: …`.
- Don't push, force-push or rewrite history unless the repository owner asks.
- Don't add agent attribution or co-author trailers to commits.
- Never commit `.env`, real keys or generated files (`dist/`, `.venv/`, `node_modules/`).
