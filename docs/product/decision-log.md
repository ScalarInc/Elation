# Elation X — Product Decision Log

Append-only. Newest entry first. Each entry records what was decided, by whom, and what it replaces.
Detailed design: [`backend-plan.md`](./backend-plan.md). Credentials and open items: [`backend-requirements.md`](./backend-requirements.md).

---

## 2026-10-16 — Revision 2: confirmed backend and product decisions (product owner)

| # | Topic | Confirmed decision | Replaces (revision 1 proposal) |
| --- | --- | --- | --- |
| 1 | Backend stack | Python + FastAPI + Pydantic; Supabase PostgreSQL; Supabase Auth | Node + Hono + Drizzle |
| 2 | Client accounts | Admin creates the account; client gets an emailed invitation link (sent with Resend) and sets their own password | Admin shares a one-time temporary password |
| 3 | Account expiry | 30 days by default; admins can extend or adjust | Same (30 days) |
| 4 | Budget traffic light | Yellow < 90 % of target; green 90–100 % inclusive; red > 100 %. The 15 % over-budget tolerance is removed | Same proposal; frontend currently yellow up to 115 % |
| 5 | Pricing | Estimates use live inventory prices; a quote request freezes prices, quantities and totals | Same |
| 6 | Inventory | Add the `Structure` category; seed provisional prices clearly marked as estimates | Same |
| 7 | Price management | Inventory and prices shown in the admin panel; **all admins** can create, edit and manage items and prices | Same (any admin) |
| 8 | Roles | `admin` and `client` only; admins act as consultants | Same |
| 9 | Messaging | **Live** messaging: one persistent thread per client, stored in Postgres, delivered with Supabase Realtime | Basic thread, no realtime |
| 10 | AI recommendations | Groq `openai/gpt-oss-120b` recommends inspiration concepts and inventory setups from event details, questionnaire answers, budget and available inventory | Same, scope confirmed |
| 11 | Groq privacy | Send only relevant event details, questionnaire answers and inventory; never names, emails, phone numbers or other direct identifiers | Same |
| 12 | Deferred | Public landing page, booking form, inquiry form, AR visualisation | Same |
| 13 | Configuration | Document Supabase, Groq, Resend (incl. verified sender), URLs and superuser config; no secrets in code or docs | Same |

Consequences
- Email is now required for onboarding, so a **Resend verified sending domain** becomes a blocking dependency (requirements §1).
- Messaging is the one place the browser reads a table directly (through Realtime), so `messages` gets RLS SELECT policies; every other table stays deny-all to the browser.
- Python code follows PEP 8 (`snake_case`); every JSON payload and query parameter is `camelCase` through Pydantic aliases.

## 2026-10-16 — Revision 1: backend proposal (assistant, not adopted as-is)

Proposed Node + Hono + Drizzle on Supabase, temporary-password onboarding, optional Resend, non-realtime messaging. Superseded by revision 2 where the table above says so; everything else carried forward. Full text is in git history of `backend-plan.md`.

## 2026-10-15 — Frontend cleanup

Mock fixtures, fake chats and simulated actions removed; `frontend/src/api/index.ts` returns empty data and actions are `TODO(backend)` handlers. See `docs/frontend-build-plan.md` deviation log.
