# Step 3 — Auth & access control

**Owner:** @Safwan (API) · @KnightX_O (auth screens) · **Estimate:** 3 days · **Depends on:** Step 2

## Goal

Invite-only accounts with an automatic expiry, server-side sessions that die the moment access is revoked or expires, three roles, and one authorization helper every event-scoped route uses. Decisions: [P1](00-decisions.md#p1-authentication--own-session-cookie-auth-not-jwt-not-a-third-party-provider), [P2](00-decisions.md#p2-passwords--argon2id-invite-code-sets-the-password), [P18](00-decisions.md#p18-authorization--404-for-resources-the-user-cannot-see).

## Account lifecycle

```
 Admin "Invite client"                       Client opens email link
 ──────────────────────▶ User(INVITED) ──────────────────────────────▶ sets password
   + Invite(code, accessDays)                                              │
                                                                           ▼
                         ┌───────────── extend ──────────────── User(ACTIVE, accessExpiresAt = now + accessDays)
                         │                                                 │
                         ▼                                                 │ expiry sweep (hourly) or request-time check
                   User(ACTIVE) ◀── admin extends ── User(EXPIRED) ◀───────┘
                                                         │
                     admin revokes (any time) ──▶ User(REVOKED) — all sessions deleted
```

- Staff (`CONSULTANT`, `ADMIN`) have `accessExpiresAt = null`.
- Expiry emails: 7 days and 1 day before (`access.expiry-warning` job) to the client and their consultant.

## Sessions

- Token: 32 random bytes, base64url, set as cookie `elx_sid`:
  `HttpOnly; Secure; SameSite=Lax; Path=/; Domain=<SESSION_COOKIE_DOMAIN>; Max-Age=<SESSION_TTL_DAYS>`.
- Stored as `Session.id = sha256(token)` — a DB leak doesn't leak usable cookies.
- Sliding expiry: if `lastSeenAt` is older than 1 hour, bump `lastSeenAt` and `expiresAt` (throttled so we don't write on every request).
- `User.lastActiveAt` updated on the same throttle (admin "last activity" column).

## Endpoints

| Method | Path | Auth | Body → Response |
| --- | --- | --- | --- |
| `POST` | `/auth/login` | public, rate-limited (5/min/IP, 10/hour/email) | `{ email, password }` → `Me`; sets cookie. Wrong creds → 401 `INVALID_CREDENTIALS` (same message for unknown email). Expired → 403 `ACCESS_EXPIRED` |
| `POST` | `/auth/logout` | session | → 204; deletes session + clears cookie |
| `POST` | `/auth/logout-others` | session | → 204; deletes all other sessions (Settings → "Sign out other sessions") |
| `GET` | `/auth/invite/:code` | public | → `{ email, name, consultantName }` to pre-fill the activation form; 404 if used/expired/revoked |
| `POST` | `/auth/invite/accept` | public, rate-limited | `{ code, password, name? }` → `Me`; sets `status=ACTIVE`, `accessExpiresAt`, logs in |
| `POST` | `/auth/password/forgot` | public, rate-limited | `{ email }` → 204 always (no account enumeration) |
| `POST` | `/auth/password/reset` | public | `{ token, password }` → 204; deletes all sessions |
| `POST` | `/auth/password/change` | session | `{ currentPassword, newPassword }` → 204; deletes other sessions |
| `GET` | `/me` | session | → `Me` |
| `PATCH` | `/me` | session | profile fields (name, phone, city, clientRole, partnerName, emergency contact) → `Me` |
| `PATCH` | `/me/notifications` | session | partial `notificationPrefs` → `Me` |
| `POST` | `/me/consent` | session | `{ version, terms, dataUse, studioShare, marketing }` → 201 |
| `GET` | `/me/sessions` | session | → list of `{ id(prefix), userAgent, lastSeenAt, current }` |
| `POST` | `/me/export` | session | → 202; job emails a JSON/ZIP export of the client's data |
| `POST` | `/me/deletion-request` | session | → 202; creates admin task (decision pending — see open question 5) |

`Me` shape (matches today's `ClientUser` so the frontend barely changes):

```ts
type Me = {
  id: string
  name: string
  email: string
  phone?: string
  role: 'client' | 'consultant' | 'admin'
  avatarInitials: string
  avatarUrl?: string
  accessExpiresAt: string | null
  consultant?: { id: string; name: string; email: string; avatarInitials: string }
  city?: string
  clientRole?: 'Bride' | 'Groom' | 'Family' | 'Organizer'
  partnerName?: string
  emergencyContactName?: string
  emergencyContactPhone?: string
  notifications: NotificationPrefs
  consent: { version: number; acceptedAt: string } | null
}
```

## Authorization helpers (`server/src/lib/policy.ts`)

```ts
requireRole(...roles: Role[])                 // route preHandler
assertEventAccess(user, eventId): Promise<Event>
  // CLIENT:     event.clientId === user.id
  // CONSULTANT: event.client.consultantId === user.id
  // ADMIN:      any
  // otherwise → AppError('EVENT_NOT_FOUND', 404)
assertThreadAccess(user, threadId)            // participant, or consultant/admin of thread.clientId
assertClientAccess(user, clientId)            // for consultant/admin routes
```

Every module that touches an event calls `assertEventAccess` first. A test suite (`policy.test.ts`) runs each event-scoped route as: owner, other client, assigned consultant, other consultant, admin — expecting 200/404/200/404/200.

## Frontend changes (@KnightX_O)

| File | Change |
| --- | --- |
| `layouts/ProtectedRoute.tsx` | Replace the `localStorage['elation-auth']` stub with `useMe()` (TanStack Query on `GET /me`). Loading → full-page skeleton; 401 → `/auth?mode=signin&from=…`; 403 `ACCESS_EXPIRED` → `/access-ended` |
| `pages/AuthPage.tsx` | Sign-in calls `POST /auth/login`. Sign-up tab becomes **Activate invitation**: code (prefilled from `?code=`), password, confirm → `POST /auth/invite/accept` |
| new `pages/AccessEndedPage.tsx` | "Your access has ended" + consultant contact |
| new `pages/ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx` | As in `PLAN.md` §3a |
| `layouts/ClientLayout.tsx` | Sign-out menu item → `POST /auth/logout`; user name/initials from `useMe()` instead of `currentUser` |
| `components/ConsentGate.tsx` | Read `me.consent`; accept → `POST /me/consent` (keep localStorage only as a cache) |
| `pages/ProfilePage.tsx`, `SettingsPage.tsx` | Save via `PATCH /me`, `PATCH /me/notifications`, `POST /auth/password/change`, `POST /auth/logout-others`, export, deletion request |
| `App.tsx` | Admin routes wrapped in `<ProtectedRoute roles={['admin','consultant']} />` |
| global | A fetch interceptor: any 401 → clear query cache → `/auth`; any 403 `ACCESS_EXPIRED` → `/access-ended` |

## Security checklist

- [ ] argon2id with library defaults (memory ≥ 19 MiB, t=2), password min 10 chars, checked against a small common-password list.
- [ ] Login, invite-accept, forgot-password rate-limited per IP and per email.
- [ ] Invite codes: 128-bit random, stored hashed, single use, 7-day validity.
- [ ] Reset tokens: 30-minute validity, single use, all sessions killed on reset.
- [ ] `Origin` check on all non-GET requests (CSRF).
- [ ] Logs never contain passwords, tokens, cookies; emails/phones redacted by pino `redact` paths.
- [ ] Access check runs on websocket upgrade and every 5 minutes on open sockets (expired → close with code 4003).

## Definition of done

- [ ] Admin-created invite → client activates → logs in → sees dashboard (seeded data).
- [ ] Setting `accessExpiresAt` in the past makes the next request return 403 `ACCESS_EXPIRED` and deletes sessions.
- [ ] Revoking a user ends an open browser session on its next request.
- [ ] Policy test matrix passes for every event-scoped route that exists at this point.
- [ ] The `elation-auth` localStorage stub is deleted from the frontend.
