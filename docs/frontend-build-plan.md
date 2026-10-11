# Elation X — Frontend Build Plan

> Living reference. We build in the order below, one page per session.
> When a page ships, tick it and note deviations here so we don't drift.

## Data flow (which page reads which store)

Every new page/component MUST declare what it consumes, so we don't
build features in isolation and leave integration gaps.

**Stores / sources of truth**
- `mocks/fixtures.ts` — `events`, `moodboards`, `inventory`, `budgets`, `messages`, `inspirations`, `currentUser`. Fixed shape, static per session (except for local `useState`-based mutations in list pages).
- `stores/questionnaireStore.ts` — Zustand + localStorage. Per-event answers + "Elation decides" flags. Seeded on boot by `mocks/hydrate.ts`.
- `lib/theme.ts` — theme state; only consumers are `<ThemeToggle />` and `<Toaster />`.

**Derived selectors** (`lib/questionnaire/derived.ts`; hooks `useResolvedEvent` / `useResolvedEvents` live in `hooks/useResolvedEvent.ts`)
- `useResolvedEvent(id)` / `useResolvedEvents()` — merge fixture event + questionnaire answers so `q1_type`, `q3_date`, `q4_guests`, `q5_venue`, `q6_indoor`, `q121_budget`, `q2_name` **override** the fixture. Every page that renders an event MUST use these, never `events` directly.
- `deriveMoodboardDefaults(answers)` — extract mood/style/palette/density/venue from questionnaire, used as initial state in `MoodboardViewer`.
- `florallyAverse(answers)`, `noCeilingDecor(answers)` — tile filters for the moodboard.

**Which page consumes what**

| Page / component | fixtures | questionnaire | derived |
| --- | --- | --- | --- |
| DashboardPage · YourEventCard | — | via derived | ✅ useResolvedEvent |
| DashboardPage · ProgressOverview | events[0] | ✅ via progress calc | — |
| DashboardPage · RecentMoodboards | moodboards | — | — |
| DashboardPage · QuickActions | — | — | — |
| MyEventsPage · EventCard | — | via derived | ✅ useResolvedEvents |
| EventDetailPage (hero, tabs, module cards) | moodboards, budgets, messages | ✅ QuestionnaireSummary | ✅ useResolvedEvent |
| EventDetailPage · MoodboardViewer | moodboards, inventory | ✅ answers → defaults & tile filters | ✅ deriveMoodboardDefaults |
| QuestionnairePage | — | ✅ read/write | ✅ useResolvedEvent (title only) |
| MoodboardsPage | moodboards (local mut), events | — | — |

**Rules going forward**
1. **Never import `events` directly** from a page/component that renders event meta. Use `useResolvedEvent` / `useResolvedEvents`.
2. Every new sprint must add a row to the table above.
3. If a sprint introduces a new store, add it to "Stores / sources of truth" and to the affected pages' rows.

---

## Scope for this build

**Frontend only. Mock data. No backend.** Every page must look and behave
production-ready but is wired to `src/mocks/*` through `src/api/index.ts`.
No auth server, no DB, no OAuth, no uploads, no WebSockets, no PDF export,
no headset integration, no payments. Swapping mock → real fetch is a later
task, out of scope now.

---

## 0. Source-of-truth reminders

Rules we must not violate (from `docs/requirements/elation-questionnaire.docx` + `docs/requirements/elation-x-modular-report.docx`):

- **Never public.** Every client route sits behind auth. Accounts are admin-issued with expiry — no open self-signup.
- Copy rule: always say **"Elation decides / Elation curated"**. Never "AI decides".
- Questionnaire uses **conditional branching**: if a client says "no ceiling décor", the ceiling follow-up questions must never render.
- Budget estimator MUST show a **traffic-light indicator**: green (on budget) / yellow (under) / red (over).
- Recommendations must feel **inventory-aware** — pull from Elation's real inventory catalogue rather than generic stock.
- **Dark mode** is a scope item; every page must have both themes.
- Every visible client-facing surface follows the brand system: sage / blush / beige / tan / cream / ink; Playfair for headings, Lato for body.

---

## 1. Foundation (do first, blocks every other page)

Not a page — the plumbing that makes every subsequent page fast to build.

### 1a. Design tokens & theming
- Extend `tailwind.config.js` with **CSS-variable-driven tokens** (`bg`, `surface`, `border`, `text`, `text-muted`, `accent`, `accent-fg`) so dark mode is one class flip on `<html>`.
- Add `.dark` variant token overrides in `index.css`.
- Add a `useTheme()` hook that reads/writes `localStorage.theme` and toggles the class.

### 1b. Shared UI primitives (`src/components/ui/`)
Build once, reuse everywhere. Match shadcn conventions so 21st.dev drop-ins keep working.

- `button.tsx` (variants: primary blush, ghost, outline, subtle, destructive; sizes sm/md/lg)
- `input.tsx`, `textarea.tsx` (with floating label + error state)
- `select.tsx` (Radix Select — searchable variant for the questionnaire's long lists)
- `checkbox.tsx`, `radio-group.tsx`, `switch.tsx`, `toggle-group.tsx`, `slider.tsx`
- `dialog.tsx`, `sheet.tsx` (Radix Dialog)
- `tabs.tsx`, `accordion.tsx`
- `card.tsx`, `separator.tsx`, `badge.tsx`, `avatar.tsx`, `tooltip.tsx`, `popover.tsx`, `dropdown-menu.tsx`
- `progress.tsx`, `skeleton.tsx`, `spinner.tsx`
- `toast.tsx` (sonner)
- `command.tsx` (cmdk — for the "search everything" palette bound to Cmd/Ctrl-K)
- `data-table.tsx` (TanStack Table — needed for admin lists)

### 1c. Shared layouts (`src/layouts/`)
- `ClientLayout` — sidebar + top area, wraps every authenticated client page.
- `AdminLayout` — separate sidebar (client management vs. client experience).
- `PublicLayout` — marketing header/footer.
- `AuthLayout` — the floating glass card we already have.

### 1d. Global concerns
- `ProtectedRoute` wrapper (checks auth, redirects to `/auth`).
- `RoleGate` (client vs. admin vs. consultant).
- `<Toaster />` mounted once at the root.
- Cmd-K `<CommandPalette />` mounted globally.
- Error boundary + 404 page.
- Loading skeletons per section (no full-screen spinners).

### 1e. Tooling / deps to add
| Dependency | Why |
| --- | --- |
| `@radix-ui/react-*` primitives | Accessible dialog/select/etc. under the hood of our UI folder |
| `react-hook-form` + `zod` + `@hookform/resolvers` | Every form (questionnaire is huge) |
| `sonner` | Toast notifications |
| `cmdk` | Cmd-K palette |
| `@tanstack/react-table` | Admin data tables |
| `recharts` | Analytics charts (admin dashboard) |
| `date-fns` | Countdowns, timeline, event dates |
| `embla-carousel-react` | Inspiration gallery + moodboard viewers |
| `@dnd-kit/core` + `@dnd-kit/sortable` | Moodboard editor drag/drop |
| `zustand` | Lightweight client state (mode toggles, questionnaire wizard state) |
| `react-hot-toast` alternative? | Skip — sonner is fine |

### 1f. Mock data layer
- `src/mocks/` folder with typed mock data for events, moodboards, inventory, budget, inspirations, questionnaire, users. All pages read from these until the backend exists.
- `src/api/index.ts` — thin async wrapper that today returns mock data via `setTimeout`; later swapped for real fetch.

---

## 2. Public-facing (unauth) pages

### 2a. `/` — Public Landing (marketing home)
**Purpose:** Explain Elation X to prospects; primary CTA is **Book Consultation** (since accounts aren't self-serve).

**Sections (top → bottom):**
1. Sticky nav: wordmark, links (Experiences, Our Approach, Services, About Us), Book Consultation button.
2. Hero — full-bleed venue photo, Playfair headline "Experience your event before it exists.", body, primary CTA + Watch Demo.
3. 4-step process ribbon: IMAGINE → CUSTOMIZE → EXPERIENCE → CREATE (icons + one-liners).
4. "Our Approach" strip — 3 cards (AI Moodboard / Smart Budget / AR Walkthrough) with brief copy + micro-illustration.
5. Portfolio grid — 6–9 event photos with hover reveal of event type (Mehndi / Baraat / etc.).
6. Testimonials carousel (Embla).
7. Press / accolades strip (logos).
8. Final CTA band ("Book your consultation") + footer (address, socials, credits).

**Interactions:** scroll-triggered fades (framer-motion `useInView`), sticky nav shrink, portfolio hover.

**Deps:** embla-carousel, framer-motion (installed).

**Notes:** Not in modular report explicitly but implied — clients must land somewhere before booking.

---

### 2b. `/about` — About Us
**Source:** first 3 pages of `docs/reference/lookbook/elation-by-fmh-lookbook.pdf`. Copy + imagery pull from there.

**Sections:**
1. Editorial hero — Playfair headline + Lookbook cover image.
2. Founder story (long-form editorial copy).
3. Philosophy / values (3–4 pillars).
4. Awards / press.
5. Team grid (portraits + roles).
6. CTA — Book consultation.

---

### 2c. `/book-consultation`
**Purpose:** Public form. Submissions land in admin queue and trigger account creation.

**Sections:**
1. Split layout — left: venue photo + "What happens next" 3-step; right: form.
2. Form (React Hook Form + Zod):
   - Name, email, phone (WhatsApp?), event type (from questionnaire list), event date, guest range, city, budget range, "how did you hear about us".
   - Optional: upload reference images / voice note.
   - GDPR-ish consent checkbox.
3. Success state — confirmation + "Your consultant will reach out within 24h" + calendar `.ics` if they picked a slot.

**Deps:** react-hook-form, zod, sonner (submission toast).

---

## 3. Auth (mostly done)

### 3a. `/auth` — Sign In / Sign Up ✅
Already built. Follow-ups:
- Wire `/forgot-password` → simple email input, success state.
- Wire `/reset-password?token=...` → new password form.
- Signup requires **invitation code** — reject client-side if empty, validate against mock in `api.ts`.
- Post-signup route to **onboarding** (see 3b) not straight to dashboard.

### 3b. `/onboarding` — First-time client walkthrough
**Purpose:** After signup, orient the client, capture bare-minimum event data before they see empty dashboard.

**Steps (multi-step wizard, framer-motion transitions):**
1. Welcome + video/loop.
2. Event basics (name, type, date, guest count, venue name).
3. Style vibe picker (image grid — pick 3–5 that resonate).
4. Ready → land on dashboard with "Continue Questionnaire" as next step.

Reuses questionnaire wizard components (see §5).

---

## 4. Client area (authenticated)

Wrapped by `ClientLayout` (sidebar + top bar).

### 4a. `/dashboard` — Home ✅ (built)
**Refinements to add later:**
- Countdown card (days-to-event) — could pin to top.
- Consultant chat prompt / next scheduled call.
- Weather widget for event date (venue outdoors).
- Recent activity feed (moodboard regenerated, budget changed, admin note).

---

### 4b. `/events` — My Events (list)
**Purpose:** All events belonging to this client (usually 1 wedding = multiple events: Mehndi + Baraat + Walima + Nikkah).

**Sections:**
1. Header — "My Events" + primary "New Event" CTA (routes to onboarding-style flow).
2. Filter chips (All / Upcoming / Past / Draft) + sort (date, name).
3. Grid of `EventCard`s — cover image, event name + type badge, date, guest count, progress bar (questionnaire→moodboard→budget→AR), status pill.
4. Empty state — illustrated ("No events yet — start your first one").

**Interactions:** hover reveals quick actions (View / Duplicate / Archive).

---

### 4c. `/events/:id` — Event Detail
**Purpose:** Everything about one event, tabbed.

**Layout:**
- Hero strip: cover photo + event name + meta (date, venue, guests, budget) + primary action ("Continue …" — resolves to the next incomplete module).
- Tabs:
  1. **Overview** — modules grid: Questionnaire, Moodboard, Budget, AR — each a big card with status + one-click "Open".
  2. **Questionnaire** — see 5.
  3. **Moodboard** — see 4d/4e.
  4. **Budget** — see 4f.
  5. **AR** — see 4g.
  6. **Files** — uploaded venue photos, reference images.
  7. **Timeline / Messages** — see 4i.

Tabs preserved in URL (`?tab=budget`).

---

### 4d. `/events/:id/moodboard` — Moodboard Viewer + Editor
**Purpose:** Show the generated moodboard; allow tweaks + regenerate.

**Sections:**
1. Left panel (controls, sticky):
   - Mood select (Romantic / Regal / etc. — from questionnaire options).
   - Style select.
   - Palette chips (multi-select with hex).
   - Density slider (Minimal / Medium / Heavy).
   - Venue lock toggle.
   - "Regenerate" (primary) — big blush button with sparkle icon.
   - "Save as concept" (ghost).
2. Right panel (moodboard canvas):
   - Masonry grid of moodboard tiles (image + inventory tag pill "Ivory Curve Sofa · Inventory").
   - Each tile clickable → drawer with product spec + swap suggestion.
   - Drag to reorder (dnd-kit).
   - Zoom / lightbox on click.
3. Concept variants (top strip) — 3 thumbnails ("Concept A/B/C") the client can flip between.

**Interactions:** loading skeleton while "generating"; framer-motion crossfade when regenerating.

---

### 4e. `/moodboards` — Moodboard Library
**Purpose:** All saved concepts across all this client's events.

Grid layout similar to `/events` but tile shows moodboard preview mosaic. Actions: Open, Duplicate, Delete.

---

### 4f. `/events/:id/budget` — Smart Budget Estimator
**Purpose:** Must-have from spec. Traffic-light indicator.

**Layout (2 columns):**
- Left (main):
  - Budget slider at top ("Your budget: PKR 2,500,000" — draggable, editable input).
  - Line items table grouped by module (Stage / Entrance / Florals / Lighting / Furniture / Ceiling / etc.):
    - Item name, qty, unit price, subtotal, "swap" button.
    - Toggle to include/exclude.
  - Add-on catalogue (searchable) — drag into items list.
- Right (sticky):
  - Traffic-light indicator (big pill) — green/yellow/red based on ratio.
    - Green if total ≤ budget × 1.0
    - Yellow if 1.0 < ratio ≤ 1.15
    - Red if > 1.15 (also red if wildly under — "You may be underinvesting")
  - Total + delta ("PKR 187,500 over budget").
  - Breakdown by category (donut chart, recharts).
  - "Request quote from Elation" primary CTA.

**Deps:** recharts, dnd-kit, react-hook-form for edits.

---

### 4g. `/events/:id/ar` — AR Visualization
**Purpose:** Preview the 3 AR sets on Meta Quest 3.

**Sections:**
1. Hero explainer — "How to preview on Meta Quest 3" (steps + illustrations).
2. AR Set cards (3):
   - Set 1: Mehndi — *Whispers of Noor*
   - Set 2: Baraat
   - Set 3: Walima
   Each shows: thumbnail render, status (Available / Rendering / Coming), estimated dev window (per report table), "Send to headset" button.
3. Floor plan + aerial view (image gallery — 4-up per set).
4. 3D asset list (Tripo AI / Meshy AI generated) — thumbnails, downloadable OBJ/GLB.

Explicit note per report: this is **AR passthrough**, not VR — copy must reflect this.

---

### 4h. `/inspirations` — Inspiration Gallery
**Purpose:** Ready-made concepts for clients who don't know what they want. Selecting one **carries into their moodboard + budget** as a starting point.

**Sections:**
1. Filter bar — event type, style, palette, budget range.
2. Pinterest-style masonry.
3. Each concept card — cover image, name, "Whispers of Noor" style tags.
4. Detail modal (or dedicated route `/inspirations/:slug`):
   - Full moodboard tiles, palette, inventory list, "Adopt this concept" button.
   - Adoption → asks which event to attach → routes to `/events/:id/moodboard` with concept pre-loaded.

---

### 4i. `/messages` — Client-Consultant Messaging
**Purpose:** Simple chat channel between client and their assigned consultant.

**Layout:** Standard 2-pane (thread list + conversation). MVP: single-thread client ↔ consultant.
- Message composer with file/image attach.
- Read receipts + typing indicator (mock).
- System messages (e.g., "Elation regenerated your moodboard").

---

### 4j. `/vendor-hub` — Vendor Hub
**Purpose:** Directory of Elation's preferred vendors surfaced to the client (photographers, catering, florists) — nice-to-have.

Grid of vendor cards + detail drawer with portfolio + "Request quote".

*Ranked lower priority — may cut if Phase 1 time is tight.*

---

### 4k. `/profile` and `/settings`
- `/profile` — avatar, name, email, phone, event partner details, emergency contact.
- `/settings` — theme (light/dark), notifications, password, connected accounts, data export, delete account.

Standard form pages; RHF + Zod.

---

## 5. Questionnaire wizard — `/events/:id/questionnaire`

This is the **biggest single build**. 134 questions across 24 categories with conditional branching.

**Approach:**
- Single-page wizard with a **left rail** listing 24 categories (progress dots).
- Right side renders one category at a time with all its questions.
- **Branching engine** (`src/lib/questionnaire/schema.ts`, `visibleQuestions`) — declarative rules per question ("if Q46 = No, skip Q47-50").
- **Autosave** every field change (debounced) → mock API → toast on save.
- Progress bar in top of right pane.
- "Elation decides" chip on questions with a creative fallback — chooses that value and skips.
- Special field types:
  - Multi-select chip grid (Options)
  - Single select radio grid with icons
  - Free-text field (with "not sure? Elation decides" toggle)
  - Colour picker (with optional HEX input)
  - Image upload (venue photos, reference boards)
  - Dimension input (numeric with unit)
- Final step — **Design Brief preview** (structured summary, exportable as PDF).

**Category order** matches doc:
1. Event Basics · 2. Overall Design Direction · 3. Colour Palette · 4. Entrance · 5. Stage · 6. Dance Floor · 7. Ceiling / Roof · 8. Seating & Chairs · 9. Floor Seating · 10. Tables & Dining · 11. Lounges · 12. Florals · 13. Lighting · 14. Fabric & Draping · 15. Backdrops & Structures · 16. Special Installations · 17. Photo / Content Area · 18. Signage & Branding · 19. Cultural / Religious / Personal · 20. Functional Requirements · 21. Budget · 22. Must-Haves & Absolute No's · 23. Creative Direction · 24. Final Client Brief

**Deps:** react-hook-form, zod, framer-motion, zustand (wizard state).

**Delivery approach:** ship in 3 slices:
- Slice A: engine + shell + Category 1 (Event Basics) end-to-end (proves the pattern).
- Slice B: Categories 2–12 (design direction, palette, big decor sections).
- Slice C: Categories 13–24 + brief preview + PDF export.

---

## 6. Admin area — `/admin/*`

Separate `AdminLayout`. Different sidebar. Same design language.

### 6a. `/admin` — Admin Dashboard
**Sections:**
- Top KPIs: Active clients, Consultations this week, Moodboards generated, Avg budget.
- Client activity feed.
- Chart: budget ranges distribution (recharts bar).
- Chart: popular themes (donut).
- Upcoming consultations list.
- Pending inquiries table.

### 6b. `/admin/clients` — Client Management
**Purpose:** Core admin function per report — create/extend/revoke temporary accounts.

**Sections:**
- Data table (TanStack): name, email, event type, event date, status (Active / Expired / Draft), access expiry, last activity, assigned consultant.
- Filters + search + bulk actions.
- Row actions: view details, extend access, revoke, message.
- "Invite Client" primary CTA — modal with name/email/event-type/expiry + generated invitation code.

### 6c. `/admin/clients/:id` — Client Detail
Full profile: their events, moodboards, budget snapshots, questionnaire completion, chat log, consultant notes, access history.

### 6d. `/admin/inquiries`
Public consultation-form submissions → convert to client account.

### 6e. `/admin/analytics`
Deeper analytics per report: popular themes, budget ranges, consultation trends. Filterable date ranges. Export.

### 6f. `/admin/inventory`
Manage the inventory catalogue that powers "inventory-aware recommendations". Add/edit/tag items, pricing, stock, imagery.

### 6g. `/admin/inspirations`
CMS for the inspiration gallery — add / edit / retire concepts.

### 6h. `/admin/team`
Consultants & admins list, roles/permissions.

### 6i. `/admin/settings`
Global settings (branding, email templates, integrations).

---

## 7. Cross-cutting things not to forget

- **Dark mode** — verify every page after we build it (add to page acceptance list).
- **Empty states** — every list has a designed empty state (illustration + copy + primary CTA).
- **Loading skeletons** — no spinners on main content; skeletons only.
- **Error states** — inline retry, not fatal screens.
- **Toasts** — every mutation (save, regenerate, delete) confirms via sonner.
- **Keyboard access** — Cmd-K palette, ESC closes modals, focus rings visible.
- **Responsive** — dashboards work at ≥1024px; mobile is graceful degrade (single column, sidebar becomes drawer).
- **Copy discipline** — "Elation decides" not "AI decides", anywhere it appears.
- **PKR currency formatter** used consistently.

---

## 8. Build order (proposed sprint plan)

| # | Chunk | Why here |
| --- | --- | --- |
| 1 | Foundation (§1) | Every other page depends on it |
| 2 | Auth polish (§3a follow-ups) + Onboarding (§3b) | Unblocks the "signed-in first-run" path |
| 3 | Refine Dashboard (§4a) | Already partly built, quick win |
| 4 | My Events + Event Detail (§4b, §4c) | Frame for everything else |
| 5 | Questionnaire Slice A (§5) | Proves engine |
| 6 | Moodboard viewer (§4d) | Payoff for the client |
| 7 | Budget Estimator (§4f) | Must-have, differentiator |
| 8 | Questionnaire Slices B + C | Fill in remaining categories |
| 9 | Inspirations Gallery (§4h) | Onboarding-adjacent feature |
| 10 | AR page (§4g) | Depends on 3D assets from your team |
| 11 | Public landing + About + Book Consultation (§2) | Marketing surfaces |
| 12 | Messages (§4i) + Profile/Settings (§4k) | Filler modules |
| 13 | Admin dashboard + Client Mgmt (§6a, §6b) | Backend readiness required |
| 14 | Remaining admin sections | As-needed |
| 15 | Vendor Hub (§4j) | Only if time |

---

## 9. Deviation log

Track anything we do differently from the spec here as we build. Each entry: `YYYY-MM-DD — page — decision — why`.

## Folder layout (frontend/src)

- `api/` - data access (mock today, real HTTP later)
- `types/` - shared domain types
- `stores/` - Zustand stores
- `hooks/` - shared React hooks
- `lib/` - pure helpers; `lib/questionnaire/` holds schema, branching, and derivations
- `components/ui/` - design-system primitives (shadcn-style, kebab-case files)
- `components/<feature>/` - feature components (`ar`, `auth`, `dashboard`, `events`, `moodboard`, `questionnaire`)
- `layouts/` - page shells; `routes/` - route guards
- `pages/<area>/` - one folder per route area
- `mocks/` - fixtures and seed data (to be replaced by the backend)
