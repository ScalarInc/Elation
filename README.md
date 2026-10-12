# Elation X

Private client platform for **Elation by FMH** — a luxury event-décor studio. Clients answer a guided design questionnaire, receive an **Elation-curated, inventory-aware moodboard**, tune a **Smart Budget Estimator** with a traffic-light indicator, browse an **Inspiration Gallery**, chat with their consultant, and preview finished setups as **AR passthrough** on Meta Quest 3.

The platform is **never public**: client accounts are created by the Elation team from the admin dashboard, carry an access **expiry**, and can be extended or revoked.

> Copy rule: the product always says **"Elation decides" / "Elation curated"** — never "AI decides".

---

## Status

| Area | State |
| --- | --- |
| Client-facing frontend (`webapp/`) | Built — every page runs on mock data |
| Admin area (`/admin/*`) | Routes + layout only, pages are placeholders |
| Backend | **Planned** — see [`docs/`](docs/README.md) |
| AR sets (Meta Quest 3) | Separate track; web app shows status + assets |

Today every page reads from `webapp/src/mocks/*` through `webapp/src/lib/api.ts` (a `setTimeout` wrapper), and questionnaire answers live in a Zustand store persisted to `localStorage`. Nothing survives a browser change, and events created in the UI are lost on refresh. The backend plan replaces this layer step by step.

---

## What the web app does

### Client area (authenticated)

| Route | Page | What it does |
| --- | --- | --- |
| `/dashboard` | Dashboard | Hero event card, countdown, progress across the 4 modules, next step, recent moodboards, activity feed |
| `/events` | My Events | All of the client's events (Mehndi, Baraat, Walima, Nikkah, …), filter/sort, **New Event** dialog |
| `/events/:id` | Event Detail | Tabs: Overview · Questionnaire · Moodboard · Budget · AR · Files · Messages |
| `/events/:id/questionnaire` | Questionnaire wizard | 24 categories from the client brief, conditional branching, "Elation decides" per question, autosave |
| `/moodboards` | Moodboard Library | Every saved concept across the client's events |
| `/events/:id/budget` | Smart Budget Estimator | Line items priced from inventory, add/remove/qty/include, traffic light (green on budget · yellow under · red over), category breakdown, request quote |
| `/budget` | Budget overview | Budget status of every event |
| `/inspirations`, `/inspirations/:slug` | Inspiration Gallery | Ready-made concepts; **Adopt** carries palette + inventory into an event's moodboard and budget |
| `/ar`, `/events/:id/ar` | AR Visualisation | The three AR sets (Baraat/Nikkah, Walima, Mehndi): status, floor plan, aerial views, 3D asset list |
| `/messages` | Messages | Client ↔ consultant threads |
| `/profile`, `/settings` | Profile & Settings | Personal details, partner/emergency contact, notification prefs, theme |

### Admin area (`/admin/*`, placeholders today)

Overview KPIs · Client management (invite / extend / revoke access) · Inquiries · Analytics (popular themes, budget ranges, consultation trends) · Inventory catalogue · Inspiration CMS · Settings.

### Public

`/auth` — sign-in / invite-code sign-up. A first-run consent gate records the client's agreement to terms and data use.

---

## Repository layout

```
.
├── webapp/                         Vite + React 19 + TypeScript + Tailwind frontend
│   └── src/
│       ├── pages/                  One file per route
│       ├── components/             Feature components (+ ui/ shadcn-style primitives)
│       ├── layouts/                ClientLayout, AdminLayout, ProtectedRoute
│       ├── questionnaire/          schema (questions + branching), store, derived selectors
│       ├── mocks/                  types.ts (domain model), fixtures, questionnaire seeds
│       └── lib/api.ts              Mock API — the seam the backend will plug into
├── docs/                           Backend plan, one Markdown file per step
├── PLAN.md                         Frontend build plan + data-flow rules
├── ELATION questionnaire.docx      134-question client brief with branching rules
├── Elation X_Modular_Report.docx   Scope, modules, priorities, timeline
├── Inventory/                      Scanned inventory sheets (source for the catalogue import)
├── Moodboard_Isnpirations/         FMH Lookbook (About Us + inspiration gallery source)
└── Sets/                           Concept material for the 3 AR sets
```

---

## Run the frontend

```bash
cd webapp
npm install
npm run dev
```

Open <http://localhost:5173/>. Useful scripts: `npm run build` (type-check + build), `npm run lint` (oxlint).

To test the auth redirect in the mock phase, run `localStorage.setItem('elation-auth', 'off')` in the browser console.

---

## Backend (planned)

Decided architecture — full reasoning in [`docs/00-decisions.md`](docs/00-decisions.md):

- **Node.js + TypeScript + Fastify** API in `server/`, sharing zod schemas and types with the frontend through `packages/shared/` (npm workspaces).
- **PostgreSQL + Prisma** for Users, Events, Questionnaires, Moodboards, Budgets, Inventory, Chat, Activity.
- **Session-cookie auth**, invite-only accounts with expiry; roles `client`, `consultant`, `admin`.
- **Moodboard curation**: deterministic scoring of questionnaire answers against tagged inventory in v1; an LLM re-rank + concept narrative layer in v2.
- **Hosting**: Railway/Render (API, websockets), Neon/managed Postgres, Cloudflare R2 for uploads.

The step-by-step plan, with owners and acceptance criteria, starts at [`docs/README.md`](docs/README.md).

### Current priorities

| Work item | Owners |
| --- | --- |
| **Events** — remove hard-coded events, make them dynamic | @KnightX_O (frontend), @Safwan (backend) |
| **Moodboard backend** | @Safwan |
| **Database** — Users, Events, Questionnaires, Chat History, Budget | @Safwan |
| **Budget Estimator** — fix the My Events → Budget Estimator journey | @KnightX_O |

---

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
- Light and dark themes on every page.
