import { z } from 'zod'

/** Chat history, realtime and the activity feed (docs/step-10-chat-activity.md). */

export const MESSAGE_MAX = 4000

export const chatPersonSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** client · consultant (Elation staff, admins included) */
  role: z.enum(['client', 'consultant']),
  avatarInitials: z.string(),
})
export type ChatPersonDto = z.infer<typeof chatPersonSchema>

export const messageSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  kind: z.enum(['user', 'system']),
  /** null for system messages. */
  author: chatPersonSchema.nullable(),
  body: z.string(),
  /** System messages: `{ type, eventId?, moodboardId?, … }` for links and cards. */
  meta: z.record(z.string(), z.unknown()).nullable(),
  clientMessageId: z.string().nullable(),
  createdAt: z.string(),
})
export type MessageDto = z.infer<typeof messageSchema>

export const threadParticipantSchema = chatPersonSchema.extend({
  /** Read receipts: the newest message this person has seen. */
  lastReadMessageId: z.string().nullable(),
})

export const threadSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  clientName: z.string(),
  eventId: z.string().nullable(),
  title: z.string(),
  participants: z.array(threadParticipantSchema),
  lastMessage: messageSchema.nullable(),
  lastMessageAt: z.string(),
  /** Messages from others the viewer hasn't read. */
  unread: z.number().int(),
})
export type ThreadDto = z.infer<typeof threadSchema>

export const listThreadsQuery = z.object({
  /** Staff: one client's threads. */
  clientId: z.string().uuid().optional(),
})

export const listMessagesQuery = z.object({
  /** Cursor: return messages older than this one. */
  before: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
})

export const messagePageSchema = z.object({
  /** Newest first. */
  messages: z.array(messageSchema),
  /** Pass as `before` for the next (older) page; null when this is the oldest. */
  nextBefore: z.string().nullable(),
})
export type MessagePageDto = z.infer<typeof messagePageSchema>

export const sendMessageBody = z.object({
  body: z.string().trim().min(1, 'Write a message first').max(MESSAGE_MAX),
  /** Attachments arrive with file storage (Step 11). */
  attachmentFileIds: z.array(z.string().uuid()).max(10).optional(),
  clientMessageId: z.string().min(8).max(64),
})
export type SendMessageBody = z.input<typeof sendMessageBody>

export const markReadBody = z.object({ messageId: z.string().uuid() })

export const unreadCountSchema = z.object({ unread: z.number().int() })

// ─────────────── Activity ───────────────

export const ACTIVITY_KINDS = ['moodboard', 'budget', 'note', 'system', 'ar', 'questionnaire', 'event'] as const
export type ActivityKindDto = (typeof ACTIVITY_KINDS)[number]

export const activitySchema = z.object({
  id: z.string(),
  clientId: z.string(),
  eventId: z.string().nullable(),
  kind: z.enum(ACTIVITY_KINDS),
  title: z.string(),
  detail: z.string().nullable(),
  at: z.string(),
})
export type ActivityDto = z.infer<typeof activitySchema>

export const listActivityQuery = z.object({
  eventId: z.string().uuid().optional(),
  /** Staff: one client's feed. */
  clientId: z.string().uuid().optional(),
  /** Return entries older than this one. */
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export const activityPageSchema = z.object({
  entries: z.array(activitySchema),
  nextCursor: z.string().nullable(),
})
export type ActivityPageDto = z.infer<typeof activityPageSchema>

// ─────────────── Realtime (/api/v1/ws) ───────────────

export type ClientSocketMessage =
  | { type: 'subscribe'; threadId: string }
  | { type: 'typing'; threadId: string }
  | { type: 'read'; threadId: string; messageId: string }

export type ServerSocketMessage =
  | { type: 'message.created'; threadId: string; message: MessageDto }
  | { type: 'message.read'; threadId: string; userId: string; messageId: string }
  | { type: 'typing'; threadId: string; userId: string; name: string }
  | { type: 'activity.created'; entry: ActivityDto }
  /** The server missed events (its database link dropped): refetch over HTTP. */
  | { type: 'resync' }

/** Close code when the session ends or access lapses. */
export const WS_CLOSE_SESSION_ENDED = 4003
