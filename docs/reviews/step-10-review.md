# Step 10 review — Chat history, realtime & activity feed

**Date:** 2026-10-13 · **Panel:** Backend Lead · Frontend Lead · Product/Elation Ops · DevOps · Security & Data
**Verdict:** ✅ Approved after fixes below.

## What was reviewed

- Database: migrations `chat_realtime` (Message.clientMessageId, ThreadParticipant.lastEmailedMessageId, NOTIFY triggers) and `chat_backfill`
- API: `server/src/lib/threads.ts`, `server/src/plugins/realtime.ts`, `server/src/modules/chat/{service,routes,digest}.ts`, `server/src/modules/activity/`, thread creation in invite acceptance and event creation, system messages in moodboards, `unreadMessagesEmail`
- Shared: `packages/shared/src/api/chat.ts`
- Webapp: `lib/realtime.ts`, `data/chat.ts`, `MessagesPage`, `ActivityFeed`, `ClientLayout` / `AdminLayout` badges, `/admin/messages`, event page activity + Messages tab, sign-out closes the socket

## Evidence

| Check | Result |
| --- | --- |
| API tests (general + event threads with the consultant; threads on invite acceptance; other clients and consultants get 404; paging newest first; unread for the other side; read pointer never moves back; retried `clientMessageId` = same message; empty / oversized / attachment messages refused; admin reads without joining, joins on reply; system notes don't badge; archived event threads leave the inbox; first-curation and "asked for an alternative" notes; activity feed by client, event, cursor and staff scope; socket: new message, typing and read receipts reach the other side only, activity push stays with its client, no session / foreign origin refused, expired client closed with 4003; digest: not before 10 min, not when online, once, not when opted out) | 15 pass |
| Whole suite | server 172 · shared 62 · webapp 3; typecheck, lint, build clean |
| Browser (Malaika + Ayesha, two isolated sessions) | Client inbox lists the general and event threads; consultant inbox at `/admin/messages`; Ayesha sees "Malaika is typing" then the message instantly, link clickable; Malaika sees "Seen by Ayesha"; unread badge clears on reading; system notes link to "Open budget" / "Open AR"; dashboard and event page feeds are real; no console errors |

## Findings

| # | Persona | Finding | Severity | Resolution |
| --- | --- | --- | --- | --- |
| 1 | DevOps | `lastEmailedMessageId` starts empty, so the first sweep after deploy would email everyone their whole unread backlog. | High | **Fixed** — `chat_backfill` marks existing messages as already emailed. |
| 2 | Security | A failure while building the digest (after claiming) left the claim in place and aborted the sweep. | Medium | **Fixed** — everything after the claim is inside the try; claims are released on any error and the sweep moves on. |
| 3 | DevOps | Presence (`isOnline`) is per instance. | Medium | **Decided** (P38) — correct for the single Railway instance; to share via Postgres before scaling out. |
| 4 | Product | Badge counted system notes (including the client's own "asked for an alternative"), the email didn't. | Medium | **Fixed** — both count people's messages only (P39). Test added. |
| 5 | Backend | Staff inboxes never back-filled threads for older clients. | Medium | **Fixed** — `chat_backfill` creates them for every client and live event; `GET /threads` still fills gaps per client. |
| 6 | Backend | Thread back-fill might include soft-deleted events. | Medium | **No change** — the soft-delete extension already filters `Event` reads. |
| 7 | Backend | Thread creation ran after the invite was accepted; a failure there gave a 500 with no session and a dead invite. | Medium | **Fixed** — threads are created in the same transaction. |
| 8 | Security | Socket frames had no rate limit; every frame can hit the database. | Medium | **Fixed** — 20 frames/s per socket, 10 open tabs per user (oldest closed). |
| 9 | Backend | No `error` listener on sockets. | Medium | **Fixed**. |
| 10 | DevOps | If the LISTEN link drops, events in the gap are lost silently. | Medium | **Fixed** — `end` handled too; on reconnect every tab gets `resync` and refetches over HTTP. |
| 11 | DevOps | LISTEN fails behind a transaction-mode pooler. | Low | **Fixed** — optional `DATABASE_LISTEN_URL` (direct connection). |
| 12 | Security | Activity push didn't hide archived/deleted events like the feed does. | Low | **Fixed**. |
| 13 | Frontend | After a socket gap the open conversation never refetched (history cached forever). | Medium | **Fixed** — reconnect / `resync` refetches message history too. |
| 14 | Frontend | Messages that arrived while the tab was hidden stayed unread after returning. | Medium | **Fixed** — marks read on `visibilitychange`, once per message. |
| 15 | Frontend | New messages yanked a reader scrolling through history to the bottom. | Medium | **Fixed** — sticks to the bottom only when already near it, on open, or on own send. |
| 16 | Frontend | Typing frames sent on every keystroke. | Low | **Fixed** — client throttles to one per 3 s, like the server. |
| 17 | Product | Spec's budget summary card and moodboard links weren't rendered. | Medium | **Decided** (P39) — notes carry the figures in text and link to the event's budget / moodboards / AR page. |
| 18 | Product | Event Messages tab deep-links instead of embedding the thread. | Low | **Decided** — the spec allows either; deep link to `/messages?thread=…`. |
| 19 | Backend | Two concurrent first generations could both post "curated". | Low | **Fixed** — event row locked before counting. |
| 20 | Backend | `GET /threads` ran one query per thread and a write transaction on every call. | Low | **Fixed** — one `DISTINCT ON` query for last messages; the thread lock is taken only when a thread is missing. |
| 21 | Product | Threads of archived events stayed in the inbox. | Low | **Fixed** — hidden like the event (P36). Test added. |
| 22–26 | Product / Security | Deferred items: attachments, `moodboard.ready` / `budget.updated`, access-extended note, consultant-note activity, consultant reassignment. | Decision | **P41** — reassignment in Step 12 must mark the old consultant inactive and remove their write access. |
| 27 | Product | A tab left open in the background suppresses the email. | Question → decided | Intended: an open tab shows the badge and title; P38. |
| 28 | Security | Admins receive every message and typing event. | Question → decided | Intended for Elation's admins (P40). |

## Decisions taken by the panel

- **P36 — Threads.** One general thread per client and one per live event, with the client and their consultant; created with the account / event, back-filled by migration; admins join on first reply; archived events' threads leave the inbox.
- **P37 — Realtime through Postgres.** Triggers announce new messages and activity on commit (so no listener ever sees a rolled-back row); typing and read receipts use `pg_notify`. Each instance LISTENs and fans out — the multi-instance path of P9 from day one.
- **P38 — Unread-message emails** from an in-process one-minute sweep (no job queue yet), people's messages only, each emailed once; any open tab counts as online; presence is per instance until we scale out.
- **P39 — System notes** don't raise the badge or email; for clients they link to the related page.
- **P40 — Consultant inbox now.** `/admin/messages` reuses the client page so both sides can talk before the admin console (Step 12).
- **P41 — Deferred**: `moodboard.ready` / `budget.updated` socket events, attachments (Step 11), access-extended note, consultant-note activity and reassignment (Step 12).
