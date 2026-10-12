# Elation X — Backend Plan (MVP)

**Revision 2 — confirmed decisions, not yet implemented** (2026-10-16).
Revision 1 (Node + Hono proposal) is superseded; what changed and why is in [`decision-log.md`](./decision-log.md). Credentials, configuration and open items: [`backend-requirements.md`](./backend-requirements.md).

Scope: a working side-project MVP. No staging, Sentry, R2, Kubernetes, elaborate CI/CD or microservices. Deferred: public landing page, booking and inquiry forms, AR visualisation (AR pages keep receiving empty data).

---

## 1. What the frontend needs

The frontend talks to `frontend/src/api/index.ts` (currently returns empty data). Each method and each `TODO(backend)` handler maps to a backend capability:

| Frontend surface | Needs from backend |
| --- | --- |
| `AuthPage`, `ProtectedRoute`, `ClientLayout` | Sign-in, session, current user, expiry enforcement, sign-out, set-password and forgot-password screens |
| Dashboard, My Events, Event detail, `NewEventDialog` | List / get / create / update events; derived module progress |
| Questionnaire (answers now only in localStorage) | Load and save answers + "Elation decides" flags per event |
| `MoodboardViewer`, Moodboards page | List per client / event; generate (Groq, rules fallback); like, duplicate, delete; tiles linked to inventory |
| Budget page, Budget list | Lines + target; save edits; server-computed totals and traffic light; starter budget; quote request (also "send to consultant") |
| Inspirations list / detail | List, detail by slug, recommended inventory, recommended concepts per event, adopt into an event |
| Messages | Live thread with the client's consultant team |
| Profile / Settings | Profile, notification prefs, consent, password change (Supabase), data export, account deletion request |
| `ActivityFeed`, event "Recent activity" | Activity log |
| `/admin/*` (placeholders today) | Clients + invitations + expiry, inventory + price editing, consultations, client conversations, basic analytics |

Response shapes follow `frontend/src/types/index.ts` (camelCase) so the frontend swaps method bodies, not components.

## 2. Architecture

```
React (Vite) ──supabase-js──▶ Supabase Auth        (sign-in, set/reset password, session refresh)
     │        └─supabase-js──▶ Supabase Realtime    (subscribe to own `messages` rows; RLS-filtered)
     │
     └── fetch + Bearer access token ──▶ FastAPI backend ──▶ Supabase Postgres (SQLAlchemy)
                                               ├──▶ Supabase Auth admin API (create/invite/ban users)
                                               ├──▶ Supabase Storage (inventory / inspiration images)
                                               ├──▶ Groq  openai/gpt-oss-120b
                                               └──▶ Resend (invitation + password-reset emails)
```

| Concern | Choice | Notes |
| --- | --- | --- |
| Runtime | Python 3.11+ (3.11.9 installed locally), `uv` for the virtualenv and lockfile | `uv` 0.9 is installed; plain `pip` also works |
| Framework | **FastAPI** + Uvicorn | Sync route handlers (run in FastAPI's threadpool); simplest correct option for the MVP |
| Validation | **Pydantic v2**; `pydantic-settings` for env | One `CamelModel` base with `alias_generator=to_camel`, `populate_by_name=True`, responses serialised `by_alias` |
| Database | **Supabase PostgreSQL** via **SQLAlchemy 2.0** + `psycopg` 3 | Connects with `DATABASE_URL` (Session pooler); server role bypasses RLS |
| Migrations | **Alembic** | Also creates RLS policies, the Realtime publication entry and helper SQL functions |
| Auth | **Supabase Auth**; public sign-ups disabled (already verified off) | Backend verifies access tokens against the project JWKS (`/auth/v1/.well-known/jwks.json`) with PyJWT; falls back to `auth.get_user(token)` if the project still signs with the legacy shared secret |
| Supabase admin calls | `supabase` Python client with `SUPABASE_SECRET_KEY` | Create users, generate invite/recovery links, ban on revoke, storage uploads |
| AI | Groq HTTP API (OpenAI-compatible) via `httpx`, strict `json_schema` output | `openai/gpt-oss-120b` confirmed available to the configured key |
| Email | Resend HTTP API via `httpx` | Invitation and password-reset emails |
| Tests | `pytest` + FastAPI `TestClient` | Only for budget maths, access rules, recommendation validation, key flows |

Naming: Python identifiers, modules and files follow PEP 8 (`snake_case`; classes `PascalCase`) — the framework convention. **All JSON fields and query parameters are `camelCase`** via the Pydantic alias generator, matching the frontend. Database tables and columns are `snake_case`. URL paths are kebab-case.

**Data access rule:** the browser never reads or writes tables through the Supabase Data API. The only exception is the Realtime subscription to `messages`, protected by RLS SELECT policies (section 8). RLS is enabled on every table; tables other than `messages` have no policies, so the publishable key can neither read nor write them.

### Proposed folder structure

```
backend/
├── pyproject.toml               # deps; managed with uv
├── alembic.ini
├── alembic/versions/            # schema, RLS policies, realtime publication
├── app/
│   ├── main.py                  # FastAPI app, CORS, exception handlers, router mounting
│   ├── config.py                # Settings (pydantic-settings), reads ../.env
│   ├── db.py                    # engine, session dependency
│   ├── models.py                # SQLAlchemy tables (one file; small schema)
│   ├── deps.py                  # current_user, require_admin, require_active_client
│   ├── schemas/                 # Pydantic request/response models (camelCase aliases)
│   ├── routers/                 # thin: parse → service → respond
│   │   ├── auth.py  me.py  events.py  questionnaire.py  moodboards.py  inventory.py
│   │   ├── budget.py  inspirations.py  messages.py  activity.py
│   │   └── admin/  clients.py  inventory.py  consultations.py  conversations.py  analytics.py  inspirations.py
│   ├── services/                # business logic, no HTTP objects
│   │   ├── access.py            # expiry, revoke, ownership checks
│   │   ├── invitations.py       # create user, generate link, send email
│   │   ├── email.py             # Resend client + templates
│   │   ├── budget.py            # totals, classify_budget, quote snapshot
│   │   ├── messaging.py
│   │   ├── activity.py
│   │   └── recommendations/
│   │       ├── service.py       # prefilter → provider → validate → persist
│   │       ├── prompt.py        # builds the de-identified Groq payload
│   │       ├── groq_provider.py
│   │       └── rules_provider.py
│   └── seed/inventory_seed.py   # provisional catalogue (section 6)
├── scripts/create_superuser.py
└── tests/
```

## 3. Account and access flow

**Admin creates a client** (`POST /api/admin/clients`):
1. Backend validates input, then calls Supabase `auth.admin.generate_link(type="invite", email, redirect_to=FRONTEND_URL/auth/set-password)`. This creates the auth user (no password) and returns a one-time action link without Supabase sending any email.
2. Backend inserts `profiles` (`role = 'client'`, `access_expires_at = now() + CLIENT_ACCESS_DEFAULT_DAYS`, `invitation_status = 'pending'`, `invited_at`, `invited_by`).
3. Backend sends a branded invitation via Resend containing the action link, the consultant's name and the access-expiry date.
4. If sending fails, the account is kept, the admin sees the error, and can retry or **copy the invite link** to share manually (`POST /api/admin/clients/{id}/invite` returns it to admins only).

**Client accepts:** link → Supabase verifies → redirects to `/auth/set-password` with a session → frontend calls `supabase.auth.updateUser({ password })` → first authenticated `GET /api/me` marks `invitation_status = 'accepted'`, `activated_at = now()`.
Invite links are single-use and expire after Supabase's email-link lifetime (default 1 h; set to 24 h in the dashboard, requirements §3). Expired link → admin re-sends.

Temporary passwords are **not** used: the invitation link covers first-time password setup, so no plaintext password is ever generated, emailed or shown.

**Sign-in:** `supabase.auth.signInWithPassword` in the browser; the access token is sent as `Authorization: Bearer` to the backend.

**Forgot password:** `POST /api/auth/forgot-password { email }` (public, rate-limited, always returns 202 so it cannot be used to discover accounts) → `generate_link(type="recovery")` → Resend email → `/auth/reset-password` → `updateUser({ password })`. Expired or revoked clients don't receive a link.

**Change password** (Settings): `supabase.auth.updateUser({ password })` after re-authenticating with the current password.

**Expiry and revocation:**
- Every API request: verify token → load profile → clients with `access_expires_at < now()` or `access_status = 'revoked'` get `403 { code: "ACCESS_EXPIRED" | "ACCESS_REVOKED" }`; the frontend signs out and shows a "contact Elation" screen.
- The same rule is applied inside the RLS function used by Realtime, so expired clients stop receiving messages too.
- Admins can extend, shorten, revoke and reactivate. Revoking also bans the Supabase user (`ban_duration`) so existing sessions can't be refreshed; reactivating lifts the ban.
- Expiry counts from account creation (assumption; requirements §4).

**First superuser:** `uv run python scripts/create_superuser.py` reads `SUPERUSER_EMAIL` / `SUPERUSER_NAME`, generates an invite link, creates the profile with `role = 'admin'`, `is_superuser = true`, no expiry; emails the link through Resend and also prints it once in the local terminal (so setup works before the sending domain is verified). Idempotent. No password is stored anywhere.

**Permissions:**

| Role | Can |
| --- | --- |
| `client` | Own profile, events, questionnaire, moodboards, budget, quote requests, inspirations (read/adopt), own message thread; inventory read-only |
| `admin` | Everything for all clients: accounts, invitations, expiry, inventory and prices, inspirations, consultations, notes, analytics, all client threads |
| superuser (`is_superuser` admin) | Additionally create, deactivate and promote other admins |

Ownership checks live in services: every client query filters by `client_id = current_user.id`; cross-client ids return 404.

## 4. Database tables

`uuid` ids, `timestamptz` timestamps, integer PKR money. Names are never unique; only ids, `inventory_items.sku` and `inspirations.slug` are.

| Table | Key columns | Notes |
| --- | --- | --- |
| `profiles` | `id` (= `auth.users.id`), `role` (`admin`\|`client`), `is_superuser`, `full_name`, `email`, `phone`, `city`, `client_role`, `partner_name`, `emergency_contact_name`, `emergency_contact_phone`, `access_expires_at` (null for admins), `access_status` (`active`\|`revoked`), `invitation_status` (`pending`\|`accepted`), `invited_at`, `invited_by`, `activated_at`, `assigned_admin_id`, `notification_prefs` jsonb, `consent` jsonb, timestamps | One row per auth user |
| `events` | `id`, `client_id`, `name`, `type`, `concept`, `event_date`, `venue_name`, `venue_city`, `venue_setting` (`Indoor`\|`Outdoor`\|`Both`), `guest_count`, `target_budget_pkr`, `cover_image_path`, `status` (`draft`\|`active`\|`past`), `questionnaire_percent`, timestamps | Progress derived (section 5) |
| `questionnaire_responses` | `event_id` (PK), `answers` jsonb, `elation_decides` jsonb, `updated_at` | Same shape as the existing Zustand store |
| `inventory_items` | `id`, `sku` (unique), `name`, `category`, `colour`, `material`, `unit` (`each`\|`set`\|`linear ft`\|`sqft`), `price_pkr`, `stock_qty`, `tags` text[], `image_path`, `is_active`, `is_provisional_price`, `price_updated_at`, `price_updated_by`, timestamps | `category` includes `Structure`; archive, don't delete |
| `inventory_price_history` | `id`, `inventory_item_id`, `old_price_pkr`, `new_price_pkr`, `changed_by`, `changed_at` | Written on every price edit |
| `moodboards` | `id`, `event_id`, `title`, `summary`, `palette` text[], `mood`, `style`, `density`, `venue`, `liked`, `source` (`ai`\|`rules`\|`inspiration`), `inspiration_id`, `created_at` | |
| `moodboard_items` | `moodboard_id`, `inventory_item_id`, `position`, `suggested_qty`, `reason` | Tiles = item images in order |
| `budget_lines` | `id`, `event_id`, `inventory_item_id`, `category` (budget bucket), `quantity`, `included`, `source` (`manual`\|`recommended`\|`inspiration`), `position` | Target lives on `events.target_budget_pkr` |
| `quote_requests` | `id`, `event_id`, `client_id`, `status` (`new`\|`contacted`\|`closed`), `target_budget_pkr`, `total_pkr`, `budget_status`, `lines_snapshot` jsonb, `client_note`, `created_at` | Snapshot: per line `inventoryItemId`, `sku`, `name`, `category`, `unit`, `unitPricePkr`, `quantity`, `subtotalPkr` |
| `inspirations` | `id`, `slug` (unique), `name`, `summary`, `style_tags` text[], `event_types` text[], `palette` text[], `budget_tier`, `cover_image_path`, `image_paths` text[], `is_featured`, `is_published`, timestamps | Admin-managed content |
| `inspiration_items` | `inspiration_id`, `inventory_item_id`, `quantity` | Carried into moodboard + budget on adopt |
| `consultation_notes` | `id`, `client_id`, `event_id`, `author_id`, `body`, `follow_up_at`, `created_at` | Admin follow-ups |
| `messages` | `id`, `client_id` (thread key: one thread per client), `sender_id`, `sender_role` (`client`\|`admin`), `body` (1–4000 chars), `created_at` | Index `(client_id, created_at)`; in the `supabase_realtime` publication |
| `activity_log` | `id`, `client_id`, `event_id`, `actor_id`, `kind`, `title`, `detail`, `created_at` | Feed + analytics |

Storage buckets: `inventory-images`, `inspiration-images` (public read, admin write via backend). Client uploads (questionnaire files) are deferred.

## 5. Business rules

**Module progress** (computed per event): questionnaire from `questionnaire_percent` (0 pending, 1–99 in progress, 100 complete); moodboard complete when a liked moodboard exists, in progress when any exists; budget in progress with lines, complete after a quote request; AR always pending (deferred).

**Budget** (backend is the source of truth):
- `subtotal = inventory_items.price_pkr × quantity` for included lines, read at request time, so the latest saved admin price always applies; `total = Σ subtotals`.
- `classify_budget(total, target)`, integer maths, no tolerance:
  - `red` when `total > target`
  - `green` when `total ≥ 0.9 × target` (checked as `10 × total ≥ 9 × target`) and `total ≤ target`
  - `yellow` when `total < 0.9 × target`
  - `noTarget` when the target is missing or 0 (UI shows a neutral prompt to set one)
- The response returns `totalPkr`, `targetBudgetPkr`, `deltaPkr`, `ratio`, `status` and per-category totals. The frontend's two copies of the old 1.15 / 0.7 logic are replaced by this response (instant local recalculation uses the same thresholds).
- Archived items stay on existing lines at their current price and are flagged; they can't be newly added.
- **Quote request:** in one transaction, read lines + current prices, compute totals, store `lines_snapshot`, `total_pkr`, `target_budget_pkr`, `budget_status`. Later price edits never change it.

**Inventory administration:** admins list (including archived), filter, create, edit any field, change price, upload an image and archive/restore. Each price change writes `inventory_price_history`, sets `price_updated_at/by` and clears `is_provisional_price`. The admin table shows price, unit, last-updated and a "Provisional" badge.

**Recommendations** — two uses, one pipeline:
- *Event setup / moodboard* (`POST /api/events/{id}/moodboards/generate`, also used by the starter budget): returns inventory items with quantities and budget categories.
- *Inspiration concepts* (`GET /api/events/{id}/inspiration-recommendations`): ranks published inspirations for the event with a one-line reason each.

Steps:
1. Deterministic prefilter in Python: active items only; remove florals if declined (`q76_florals = "No"` or very minimal intensity) and ceiling items if `q46_ceiling = "No"`; score by tag, colour, category, event type and style; keep the top ~60 (for concepts: published inspirations scored by event type, style, palette, budget tier).
2. Build a de-identified payload (below) and call Groq with strict `json_schema`, timeout `GROQ_TIMEOUT_MS`.
3. Validate: drop unknown ids, clamp quantities (chairs ≤ guests, tables ≈ guests ÷ 10, centrepieces ≤ tables), cap item count. **Prices and totals are always recomputed from the database; the model never sets or sees authority over prices.**
4. If Groq is unavailable, times out, or the output fails validation, `rules_provider` produces the result from the prefilter scores. `moodboards.source` records which ran. UI copy stays "Elation curated".
5. Simple per-user limit: 10 generations per hour (in-memory).

**Groq privacy — payload whitelist:** event `type`, `date` (month and year only), `guestCount`, `venueSetting`, `venueCity`, `targetBudgetPkr`; questionnaire answers for design-related question ids only (single/multi-choice values, palette hexes, density, must-haves/no's); candidate inventory (`id`, `name`, `category`, `colour`, `material`, `tags`, `unit`, `pricePkr`) or candidate inspirations (`id`, `name`, `styleTags`, `eventTypes`, `palette`, `budgetTier`, `summary`). Never sent: client name, partner and emergency-contact names, email, phone, venue name, event concept name, uploaded files, message content. Free-text answers that are included pass through a redaction step that removes email addresses and phone numbers. The payload builder lives in `prompt.py` and has its own test.

**Errors:** JSON `{ "error": { "code": "VALIDATION_FAILED", "message": "...", "details": {} } }`. Pydantic errors → 400 (not FastAPI's default 422 shape), 401 unauthenticated, 403 forbidden/expired, 404 missing or not owned, 409 conflicts, 502 for upstream failures surfaced to admins (email send). No stack traces in responses.

## 6. Provisional equipment pricing

**These prices are placeholder estimates written for development. They are not Elation X prices and have not been verified against Elation's catalogue or the market.** They exist only so the budget estimator returns meaningful totals until the real inventory list arrives.

Assumptions: per-event rental in PKR (2026), basic setup included; transport, labour surcharges, taxes and fresh-flower seasonality excluded. Every seeded row has `is_provisional_price = true` until an admin edits its price.

Categories: the 10 in `InventoryItem['category']` plus **Structure**. The scans in `docs/reference/inventory/` are photos without names or prices, so they informed item types only.

| SKU (seed key) | Item | Category | Unit | Provisional PKR |
| --- | --- | --- | --- | ---: |
| `sofa-stage-3seat` | Stage sofa, 3-seater, velvet | Sofa | each | 35,000 |
| `sofa-lounge-2seat` | Lounge sofa, 2-seater | Sofa | each | 18,000 |
| `sofa-accent-chair` | Accent armchair | Sofa | each | 6,000 |
| `chair-chiavari` | Chiavari chair (gold or clear) | Chair | each | 600 |
| `chair-acrylic` | Acrylic ghost chair | Chair | each | 900 |
| `chair-banquet-cover` | Banquet chair with cover | Chair | each | 450 |
| `chair-floor-cushion` | Floor cushion / gaddi | Chair | each | 1,200 |
| `table-round-10` | Round dining table, 10 seats, with linen | Table | each | 4,500 |
| `table-banquet-8ft` | Banquet table, 8 ft, with linen | Table | each | 4,000 |
| `table-low-majlis` | Low majlis table | Table | each | 3,000 |
| `table-cocktail` | Cocktail / high table | Table | each | 2,500 |
| `chandelier-crystal-large` | Crystal chandelier, large | Chandelier | each | 45,000 |
| `chandelier-hanging-medium` | Hanging chandelier, medium | Chandelier | each | 18,000 |
| `floral-centrepiece` | Fresh floral centrepiece | Floral | each | 6,500 |
| `floral-pillar-arrangement` | Floral pillar / stand arrangement | Floral | each | 15,000 |
| `floral-stand-artificial` | Artificial petal floral stand | Floral | each | 8,000 |
| `floral-ceiling-install` | Hanging floral ceiling installation | Floral | sqft | 3,500 |
| `floral-garland-runner` | Floral garland / runner | Floral | linear ft | 1,800 |
| `backdrop-stage-set` | Stage backdrop panel set (up to 24 ft) | Backdrop | set | 150,000 |
| `backdrop-arch-single` | Single arch backdrop | Backdrop | each | 60,000 |
| `structure-stage-platform` | Stage platform with carpet | Structure | sqft | 180 |
| `structure-dance-floor` | Dance floor panels | Structure | sqft | 250 |
| `structure-entrance-arch` | Entrance arch structure | Structure | each | 75,000 |
| `structure-iron-canopy` | Wrought-iron canopy frame | Structure | each | 40,000 |
| `prop-urn-lantern-pair` | Decorative urn / lantern pair | Prop | set | 5,000 |
| `prop-photo-booth-set` | Photo-area prop set | Prop | set | 25,000 |
| `signage-welcome-easel` | Welcome sign with easel | Signage | each | 8,000 |
| `signage-neon-custom` | Custom neon / LED name sign | Signage | each | 30,000 |
| `lighting-uplighter` | LED uplighter | Lighting | each | 2,500 |
| `lighting-fairy-canopy` | Fairy-light canopy | Lighting | sqft | 120 |
| `lighting-candle-cluster` | Candle cluster set | Lighting | set | 3,000 |
| `lighting-hanging-lantern` | Hanging lantern | Lighting | each | 2,000 |
| `fabric-ceiling-drape` | Ceiling fabric draping | Fabric | sqft | 180 |
| `fabric-wall-drape` | Wall / pillar draping | Fabric | linear ft | 450 |

Seeding: `inventory_seed.py` runs as part of the setup command after migrations (`uv run alembic upgrade head && uv run python -m app.seed.inventory_seed`). It upserts by `sku`: new SKUs are inserted, existing rows keep any admin-edited price (`is_provisional_price = false`) and are never duplicated. Images stay empty until uploaded.

Budget buckets used by `BudgetPage` (Stage, Florals, Ceiling, Seating, Dining, Entrance, Lighting, Fabric) remain the line `category`. The bucket → inventory-category map moves to the backend; `Structure` maps to Stage and Entrance.

## 7. API endpoints

Prefix `/api`, JSON, camelCase. Client routes only return the caller's own data. FastAPI's generated docs at `/docs` are enabled in development only.

| Method & path | Who | Purpose |
| --- | --- | --- |
| `GET /health` | public | Liveness |
| `POST /auth/forgot-password` | public | Send recovery email (202 always; rate-limited) |
| `GET /me` · `PATCH /me` | any | Profile (+ consultant summary, access expiry) · update |
| `PATCH /me/notifications` · `POST /me/consent` | any | Preferences · consent record |
| `GET /events` · `POST /events` | client | List · create |
| `GET /events/{id}` · `PATCH /events/{id}` | client | Detail with progress · update basics |
| `GET /events/{id}/questionnaire` · `PUT /events/{id}/questionnaire` | client | Load · save answers, decides, percent |
| `GET /moodboards` · `GET /events/{id}/moodboards` | client | All · per event, with items |
| `POST /events/{id}/moodboards/generate` | client | Recommendation run → new moodboard |
| `PATCH /moodboards/{id}` · `POST /moodboards/{id}/duplicate` · `DELETE /moodboards/{id}` | client | Like/rename · duplicate · delete |
| `GET /inventory` · `GET /inventory/{id}` | any | Active catalogue, read-only |
| `GET /events/{id}/budget` · `PUT /events/{id}/budget` | client | Lines + target + computed totals/status · save |
| `POST /events/{id}/budget/generate` | client | Starter budget from recommendations |
| `POST /events/{id}/quote-requests` | client | Freeze snapshot; notify admins |
| `GET /quote-requests` | client | Own quotes |
| `GET /inspirations` · `GET /inspirations/{slug}` | any | Published concepts with linked items |
| `GET /events/{id}/inspiration-recommendations` | client | Ranked concepts for an event |
| `POST /inspirations/{slug}/adopt` `{ eventId }` | client | Create moodboard + budget lines from concept |
| `GET /activity?eventId=` | client | Activity feed |
| `GET /messages?before=&limit=` · `POST /messages` | client | Own thread history (paged) · send |
| **Admin** (`role = admin`) | | |
| `GET /admin/clients` · `POST /admin/clients` | admin | List (search, status, expiring soon) · create + invite |
| `GET /admin/clients/{id}` · `PATCH /admin/clients/{id}` | admin | Detail · edit, extend/adjust expiry, revoke/reactivate, assign consultant |
| `POST /admin/clients/{id}/invite` | admin | Re-send invitation; returns copyable link |
| `GET /admin/admins` · `POST /admin/admins` · `PATCH /admin/admins/{id}` | superuser | Manage admin accounts |
| `GET /admin/inventory` · `POST /admin/inventory` | admin | All items incl. archived · create |
| `PATCH /admin/inventory/{id}` · `POST /admin/inventory/{id}/image` | admin | Edit fields / price (writes history), archive · upload image |
| `GET /admin/inventory/{id}/price-history` | admin | Price audit |
| `GET /admin/consultations` | admin | Clients with event progress, quote requests, follow-ups due |
| `PATCH /admin/quote-requests/{id}` | admin | Update quote status |
| `GET /admin/clients/{id}/notes` · `POST /admin/clients/{id}/notes` | admin | Consultation notes |
| `GET /admin/conversations` | admin | Client threads with last message, newest first |
| `GET /admin/clients/{id}/messages` · `POST /admin/clients/{id}/messages` | admin | Thread history · reply |
| `GET /admin/analytics` | admin | Active/expiring clients, events by type, budget ranges, popular styles, moodboards per week, quote requests |
| `GET/POST/PATCH /admin/inspirations` | admin | Inspiration CMS |

Not included: AR endpoints (deferred; `api.ar.*` keeps returning empty arrays), public booking/inquiry endpoints (deferred), file uploads for questionnaire answers (deferred).

## 8. Live messaging

- **Thread:** one per client; `messages.client_id` is the thread key. All admins can read and reply to every client thread (they all act as consultants).
- **Sending:** always through the backend (`POST /api/messages`, `POST /api/admin/clients/{id}/messages`). The backend checks role, ownership and expiry, validates length (1–4000 characters, trimmed), inserts the row and writes an activity entry. The browser has no INSERT/UPDATE/DELETE rights on `messages`.
- **History:** loaded from the backend, newest 50 first with `before` cursor paging.
- **Live delivery:** Supabase Realtime **Postgres Changes** on `INSERT` into `public.messages`. Clients subscribe with filter `client_id=eq.<own id>`; the admin inbox subscribes without a filter. Realtime only delivers rows the subscriber's RLS SELECT policy allows.
- **Database setup (Alembic migration):**
  - `alter publication supabase_realtime add table public.messages;`
  - RLS enabled; one SELECT policy for role `authenticated`: `client_id = auth.uid() and public.has_active_access(auth.uid())` **or** `public.is_admin(auth.uid())`.
  - `is_admin()` and `has_active_access()` are `security definer` SQL functions reading `profiles` (avoids RLS recursion; `search_path` pinned).
  - No INSERT/UPDATE/DELETE policies → denied for browser roles.
- **Frontend:** `@supabase/supabase-js` channel subscription on the Messages page and admin inbox; merge incoming rows by `id` (deduplicates the sender's own echo); states for loading, empty, send failure (message stays in the composer), and connection lost (banner + reload history on reconnect).
- **Removed from the current UI:** typing indicator, "Seen" receipts, attachment, emoji, video and phone buttons, "Active now", unread counts. The client sees a single thread, so the thread list pane collapses to one entry.

## 9. Frontend changes required later (planning only)

Add `@supabase/supabase-js`; Vite `envDir: '..'`; replace `api/index.ts` bodies with `fetch` calls carrying the access token; real `ProtectedRoute` and admin guard; new screens `/auth/set-password`, `/auth/reset-password`, forgot-password form, access-expired screen; remove the signup tab, invitation-code field and Google/Apple buttons; admin pages (Clients with invite/expiry actions, Inventory with price editing, Consultations, Conversations inbox, Analytics, Inspirations); questionnaire store synced with the API; loading vs not-found in `useResolvedEvent`; one budget classification with the new thresholds; `Structure` in `InventoryItem['category']`; inventory references on moodboard tiles; messaging simplifications from section 8.

## 10. Implementation sequence

Progress: **steps 1–2 done (2026-10-16)** — migration `5073a4c38412` applied; Supabase sign-in, set/reset password, `/api/me`, role guards and `create_superuser` in place. Superuser script lives at `app/scripts/create_superuser.py`.

1. Backend scaffold with `uv`, settings from `../.env`, `/health`, SQLAlchemy models, first Alembic migration (tables, RLS on, helper functions, messages policy and publication).
2. Token verification + `deps.py` guards, `create_superuser.py`, `/me`; frontend Supabase client, sign-in, set-password and reset screens, `ProtectedRoute`, admin guard, signup UI removed.
3. Invitations and client management (create, invite via Resend, copy link, resend, extend/revoke) + admin Clients page.
4. Inventory seed, admin inventory CRUD + price editing + history + image upload; client inventory read.
5. Events and questionnaire persistence.
6. Budget service and endpoints, quote snapshot, budget pages wired with new thresholds.
7. Recommendations (rules provider first, then Groq with privacy payload) and moodboard endpoints; viewer wired.
8. Inspirations CMS, list/detail, adopt flow, event concept recommendations.
9. Live messaging: endpoints, Realtime subscription, admin inbox.
10. Consultations, notes, analytics.
11. Tests for budget classification and totals, quote snapshot immutability, access expiry and role/ownership guards, Groq payload whitelist and fallback (Groq mocked), messaging RLS check; README local-setup instructions.
