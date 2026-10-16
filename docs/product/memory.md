# Elation X — Project Memory

Hand-off context for a new chat or coding agent. Read in this order: [`README.md`](../../README.md) (what it is, how to run it) → [`AGENTS.md`](../../AGENTS.md) (rules, conventions, pitfalls) → this file (history, current state, how the owner likes to work, what's left).

Last updated: 2026-10-16. Contains no secrets; real values live only in the root `.env` (git-ignored).

---

## 1. Project in one paragraph

Elation X is an invite-only web app for clients of **Elation by FMH** (luxury Pakistani wedding/event décor). Clients plan events: questionnaire → AI-curated moodboards from real inventory → live-priced budget with a traffic light → frozen quote requests → live chat with their consultant. Admins (who act as consultants) invite clients with expiring access, manage inventory and prices, curate inspiration concepts, track consultations and see analytics. Source requirements: `docs/requirements/elation-x-modular-report.docx` and `elation-questionnaire.docx`.

## 2. Repository and git

- Remote: `https://github.com/ScalarInc/Elation.git`. Work happens on branch **`safwan-dev`** (cloned from `frontend-only`, base commit `0fabd61 Build out the full client-facing frontend`). Other remote branches: `main`, `frontend-only`, `feature/backend`, `deployment` (not touched).
- Local folder: `D:\Scalar\Elation-backend` (Windows, PowerShell).
- 41 commits on top of `0fabd61`. At the time of writing, `safwan-dev` is 1 commit ahead of `origin/safwan-dev` (`7b5a251`, the questionnaire fix).
- **History was redated** at the owner's request: repo cleanup and planning on Oct 11, steps 1–2 on Oct 12, steps 3–4 on Oct 13, steps 5–6 on Oct 14, steps 7–8 on Oct 15, steps 9–11 plus later fixes on Oct 16. The owner force-pushed the redated history. New commits should keep using realistic Oct 16 (or later) timestamps unless told otherwise. To set a date: `$env:GIT_AUTHOR_DATE='2026-10-16T18:00:00+05:00'; $env:GIT_COMMITTER_DATE=$env:GIT_AUTHOR_DATE; git commit -m "..."; Remove-Item Env:GIT_AUTHOR_DATE,Env:GIT_COMMITTER_DATE`.
- A local branch `backup-before-redate` may still exist (old history). Safe to delete with `git branch -D backup-before-redate` once the owner confirms.

## 3. How the owner wants to work

- **Never push.** Commit when asked, then give the push command (`git push`, or `git push --force-with-lease origin safwan-dev` after a history rewrite). The owner pushes themselves.
- **Commit messages:** one short conventional line (`feat: …`, `fix: …`, `docs: …`, `test: …`, `refactor: …`, `chore: …`). No multi-line bodies. **No agent attribution or co-author trailers.** Prefer a few incremental commits (e.g. backend, frontend, docs) over one big one.
- **Speed over ceremony.** They asked for "quick, only necessary things so it doesn't break, clean code a new dev can understand". Don't over-narrate; don't micromanage tiny steps.
- **End-of-step report** they expect: what was done, what changed, new functionality, and what they'll see in the frontend.
- **Don't implement beyond the ask.** Planning prompts mean docs only; "remove mock data" meant no new features.
- Plain, direct communication. They are fine with honest notes about what wasn't verified (e.g. "not clicked through in a browser").

## 4. Confirmed decisions (see `decision-log.md` for the full table)

- Stack: **Python FastAPI + Pydantic + SQLAlchemy + Alembic** backend (uv), **Supabase** Postgres/Auth/Storage/Realtime, **Groq `openai/gpt-oss-120b`** for recommendations, **Resend** for email. (An earlier Node/Hono proposal was rejected.)
- Accounts: admin invites by email (Supabase `generate_link` + Resend). Client sets their own password from the link. No temporary passwords. Access expires after **30 days** by default; admins extend, shorten, revoke (also bans in Supabase) or reactivate. Public sign-up is disabled in Supabase.
- Roles: `admin` and `client` only; admins act as consultants. Superuser flag exists on the first admin.
- Budget traffic light: **yellow < 90 %, green 90–100 % inclusive, red > 100 %**, no tolerance. Estimates use live prices; quote requests freeze prices, quantities and totals.
- Inventory includes the **Structure** category. All admins can edit prices.
- Messaging: one live thread per client via Supabase Realtime, RLS-protected.
- Groq privacy: only event type, month, guest count, setting, budget, design answers and inventory candidates. No names, contacts, venue/concept names, exact dates, uploads or messages.
- Deferred: AR (Meta Quest 3), public landing page, booking form, inquiry form, production deployment.
- Resend uses the test sender `onboarding@resend.dev` for now (only delivers to the Resend account owner); admins copy invite links from the dialog.

## 5. What was built (all 11 planned steps are done)

| Step | Delivered |
| --- | --- |
| Prep | Repo restructured (`webapp/` → `frontend/`, docs into `docs/`), all mock data, fake chats and simulated actions removed, planning docs written |
| 1 | Backend scaffold, settings from `../.env`, `/api/health`, 14 tables, initial migration with RLS on every table, `is_admin`/`has_active_access` SQL functions, messages SELECT policy, Realtime publication |
| 2 | Supabase JWT verification (JWKS, ES256, 60 s leeway), `/api/me`, forgot-password, `create_superuser` script; frontend sign-in, set/reset password, access-ended screen, role-guarded routes |
| 3 | Admin client management: invite (Resend + copyable link), re-send, edit expiry, assign consultant, revoke/reactivate; admin Clients page |
| 4 | Inventory seed (34 provisional items), admin inventory CRUD, inline price editing, price history, image upload to `inventory-images` |
| 5 | Events and questionnaire persisted; answers update event type/date/guests/venue/target budget; debounced autosave |
| 6 | Budget API with live pricing and traffic light, autosave, quote requests with frozen snapshot |
| 7 | Moodboard recommendations: slot-based rules + Groq strict JSON (short refs to fit the 8k TPM free tier), validation, rules fallback, budget fitting; starter budget from moodboard; like/duplicate/delete |
| 8 | Inspirations: admin CMS (images in `inspiration-images`, inventory links, publish/featured), client gallery, adopt into event (moodboard + budget if empty), Groq-ranked concept recommendations per event |
| 9 | Live messaging: `/api/messages`, admin inbox and replies, Supabase Realtime delivery, verified isolation between clients |
| 10 | Admin Overview (KPIs, charts, activity), Analytics, Consultations (progress, quote status, follow-up notes); client activity feed |
| 11 | Extra tests (quote snapshot, budget ownership), full README setup guide, 18/18 end-to-end smoke run |
| After | README rewritten, `AGENTS.md` added; questionnaire no longer re-asks event basics (pre-filled by backend) or yes/no questions already answered by "Which areas need décor?" (`AREA_GATES`) |

Migrations applied to the live Supabase DB (head `5a8109cc2edd`):
1. `5073a4c38412` initial schema + security
2. `8d10bbe563fa` `moodboard_items.budget_category`
3. `5a8109cc2edd` `consultation_notes.completed_at`

Database contents right now: the superuser profile and the 34 seeded inventory items. All test clients, events, concepts and images created during verification were deleted.

## 6. Environment status (no values here)

- Root `.env` is filled and verified: Supabase URL, publishable and secret keys (new `sb_` format), Session-pooler `DATABASE_URL`, superuser email, Groq key (model available), Resend key. `EMAIL_FROM` should be `Elation X <onboarding@resend.dev>` until a domain is verified.
- Supabase dashboard: public sign-ups **off** (verified). Owner was told to set Site URL `http://localhost:5173`, redirect URLs `/auth/set-password` and `/auth/reset-password`, and Email OTP expiry `86400`; not independently verified.
- Local tools: Python via uv (venv uses CPython 3.12), Node 22, uv 0.9.

## 7. How verification has been done

- Backend unit tests: `cd backend; uv run pytest -q` (85 passing). They never touch the real DB.
- Frontend: `cd frontend; npm run build` and `npm run lint` (0 errors; ~19 warnings, all the existing "setState in effect" / data-on-mount pattern).
- Live checks: temporary Python scripts in `backend/` that create a throwaway client via `services.clients.create_client`, get a real access token with `supabase_admin.generate_link("magiclink", …)` + following the redirect, call the running API, then `supabase_admin.delete_user(id)` (cascades). Scripts are deleted after running. Start a temporary API with `uv run uvicorn app.main:app --port 8787` if none is running, and stop it afterwards.
- Realtime/RLS was checked with a Node script using `@supabase/supabase-js` and two client sessions.
- **Not yet done:** a manual click-through of the UI in a real browser.

## 8. Loose ends (owner said "we'll see about the loose ends" after steps 10–11)

- Settings page: notification toggles, data export and delete-account are `TODO(backend)`; consent (`ConsentGate`) is stored only in localStorage, though `profiles.consent` exists.
- Questionnaire file uploads (`QuestionField.tsx` upload kind) do nothing; only 54 of 134 questions exist in `lib/questionnaire/schema.ts`.
- Admin **Inquiries** route and **Settings** page are placeholders (Inquiries was removed from the nav and replaced by Consultations; the route still exists). Suggested: hide both.
- Moodboard drawer "Ask my consultant" only opens Messages; it doesn't pre-fill a message.
- Client Settings has no list of sessions/devices; "Sign out other sessions" uses Supabase `signOut({ scope: 'others' })`.
- AR pages keep empty states and `TODO(backend)` handlers by design.

## 9. Content needed from Elation (not code)

- Verified Resend sending domain and `EMAIL_FROM` before real client invites.
- Real inventory list with prices and photos to replace the provisional seed (`docs/reference/inventory/` scans are photos only, no names or prices).
- Real inspiration concepts (gallery starts empty).
- Remaining questionnaire questions from the .docx.

## 10. Things that bit us (also in AGENTS.md)

- Supabase secret key returns 401 from browser-like User-Agents (PowerShell `Invoke-WebRequest`); use a custom `-UserAgent` or httpx.
- Fresh Supabase tokens can be "not yet valid" due to clock skew; keep the 60 s leeway.
- The DB password originally contained `@`; it was reset. Use the Session pooler host, not the IPv6-only direct host.
- Groq free tier is 8,000 tokens/minute; the first moodboard payload was 8,619 tokens and got HTTP 413 until candidate ids were shortened.
- A stale auto-reload server once held port 8787 and served old code (new endpoints returned 404).
- Owner once pasted real keys into `.env.example` (tracked file); it was moved to `.env` and the template restored. Always check `.env.example` stays placeholder-only.
- Windows console (cp1252) can't print some characters in Groq output; set `PYTHONIOENCODING=utf-8`.
- Files mix LF/CRLF; multi-line scripted replacements must handle both.

## 11. Useful entry points

- Run everything: README "Getting started".
- Business rules: `backend/app/services/` (`budget.py`, `clients.py`, `events.py`, `inventory.py`, `inspirations.py`, `messaging.py`, `oversight.py`, `recommendations/`).
- Frontend data layer: `frontend/src/api/index.ts` (client) and `api/admin.ts` (admin); types in `src/types/`.
- Product docs: `docs/product/decision-log.md`, `backend-plan.md` (data model, endpoints, pricing table, progress line), `backend-requirements.md` (credentials checklist).
