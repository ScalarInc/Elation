# Step 10 — Chat history, realtime & activity feed

**Owner:** @Safwan · **Frontend wiring:** @KnightX_O · **Estimate:** 3 days · **Depends on:** Step 3 (attachments need Step 11)

> Priority item (Database): *Chat History* entity.

## Model recap (Step 2)

`Thread` (scoped to one client, optionally one event) → `ThreadParticipant` (client, consultant; admins join on first reply) → `Message` (`USER` or `SYSTEM`, attachments via `File`). Read state = `ThreadParticipant.lastReadMessageId`. UUIDv7 message IDs give time ordering and cursor pagination for free.

### Thread creation rules

- On invite acceptance: a general thread "Elation Studio" (client + consultant).
- On event creation: an event thread "<Concept> · <Type>" (matches today's `MessageThread.eventId`).
- Consultant reassignment: new consultant added as participant, old one kept for history but marked inactive.

### System messages

Posted by other modules through `chat.postSystem(threadId, { type, body, meta })`:

| Trigger | Message |
| --- | --- |
| Moodboard generated (first time / on submit) | "Elation curated 3 new concepts for Whispers of Noor." |
| Moodboard "Ask my consultant" for a tile | "Malaika asked for an alternative to Ivory Curve Sofa." |
| Budget sent to consultant / quote requested | summary card: total, light, delta |
| Inspiration adopted | "Adopted *Whispers of Noor* as the starting concept." |
| Access extended | "Your access has been extended to 15 Jan 2027." |

`meta` carries IDs so the UI can render a link/card.

## Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/threads` | User's threads with `unread` count and last message preview (MessagesPage left pane) |
| `GET` | `/threads/:id/messages?before=<messageId>&limit=30` | Newest first, cursor = message id |
| `POST` | `/threads/:id/messages` | `{ body (1–4000 chars), attachmentFileIds?: string[], clientMessageId }` → 201. `clientMessageId` makes retries idempotent and lets the UI reconcile optimistic messages |
| `POST` | `/threads/:id/read` | `{ messageId }` |
| `GET` | `/unread-count` | Sidebar/top-bar badge |
| `GET` | `/activity?eventId=&cursor=` | Activity feed (dashboard `ActivityFeed`, event detail) |

Rate limit: 30 messages/minute/user. Message bodies are plain text (rendered with line breaks + linkified URLs, never as HTML).

## Realtime (`/api/v1/ws`)

```jsonc
// client → server
{ "type": "subscribe", "threadId": "…" }
{ "type": "typing", "threadId": "…" }                 // throttled to 1 per 3 s
{ "type": "read", "threadId": "…", "messageId": "…" }

// server → client
{ "type": "message.created", "threadId": "…", "message": { … } }
{ "type": "message.read", "threadId": "…", "userId": "…", "messageId": "…" }
{ "type": "typing", "threadId": "…", "userId": "…", "name": "Ayesha" }
{ "type": "activity.created", "entry": { … } }
{ "type": "moodboard.ready", "eventId": "…", "generationId": "…" }
{ "type": "budget.updated", "eventId": "…", "version": 7 }
```

- Auth: session cookie on upgrade; re-checked every 5 min; expired/revoked → close code `4003`.
- Server sends a ping every 25 s; client reconnects with exponential backoff and, on reconnect, refetches `/threads` (missed messages come from HTTP, not replay).
- Hub: `Map<userId, Set<WebSocket>>` in-process. Multi-instance later: `NOTIFY elation_events, '<json>'` + `LISTEN` per instance ([P9](00-decisions.md#p9-realtime--fastifywebsocket-postgres-listennotify-when-we-scale-out)).
- Offline delivery: if the recipient has no open socket and `notificationPrefs.consultantMessages` is on, a pg-boss job emails a digest after 10 minutes of unread.

## Activity feed

`activity.record({ clientId, eventId?, actorId?, kind, title, detail?, meta? })` is called by services (event created, questionnaire submitted, moodboard saved/primary, budget quote, AR status change, consultant note shared). Read via `/activity`; pushed via `activity.created`. Replaces `api.activity.*` fixtures.

## Frontend changes (@KnightX_O)

| File | Change |
| --- | --- |
| `pages/MessagesPage.tsx` | Threads + messages via TanStack Query (`useInfiniteQuery` for history); send = optimistic insert with `clientMessageId`, reconcile on `message.created`; typing indicator & read receipts from websocket (already designed, currently mocked); attachments via Step 11 upload hook |
| new `lib/realtime.ts` | One socket per tab, `useRealtime(event, handler)` hook; dispatches to query cache invalidations |
| `layouts/ClientLayout.tsx` | Unread badge from `/unread-count` + realtime |
| `components/ActivityFeed.tsx` | `/activity` + `activity.created` |
| `pages/EventDetailPage.tsx` | Messages tab shows the event thread inline (or deep-links `/messages?thread=…`) instead of the generic hand-off |

## Definition of done

- [ ] Client and consultant in two browsers see each other's messages instantly, with typing and read receipts.
- [ ] Full chat history persists and paginates.
- [ ] System messages appear for moodboard, budget, inspiration and access events.
- [ ] Activity feed is real on dashboard and event detail.
- [ ] Expired client's open socket is closed within 5 minutes.
