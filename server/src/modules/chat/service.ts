import type { MessageDto, ThreadDto } from '@elation/shared/api'
import { Prisma, type Message, type User } from '../../generated/prisma/client'
import { AppError } from '../../lib/errors'
import { assertClientAccess, assertThreadAccess } from '../../lib/policy'
import { ensureThreads } from '../../lib/threads'
import type { Db } from '../../plugins/db'
import type { Realtime } from '../../plugins/realtime'
import { initials } from '../me/dto'

type Actor = Pick<User, 'id' | 'role' | 'name'>

type Person = Pick<User, 'id' | 'name' | 'role'>

export function toPerson(u: Person) {
  return {
    id: u.id,
    name: u.name,
    role: u.role === 'CLIENT' ? ('client' as const) : ('consultant' as const),
    avatarInitials: initials(u.name),
  }
}

const personSelect = { id: true, name: true, role: true } as const

export function toMessageDto(m: Message & { author: Person | null }): MessageDto {
  return {
    id: m.id,
    threadId: m.threadId,
    kind: m.kind === 'SYSTEM' ? 'system' : 'user',
    author: m.author ? toPerson(m.author) : null,
    body: m.body,
    meta: m.meta && typeof m.meta === 'object' && !Array.isArray(m.meta) ? (m.meta as Record<string, unknown>) : null,
    clientMessageId: m.clientMessageId,
    createdAt: m.createdAt.toISOString(),
  }
}

/** Which client accounts' threads the actor sees in their inbox. */
async function inboxClientIds(db: Db, actor: Actor, clientId?: string): Promise<string[] | null> {
  if (actor.role === 'CLIENT') return [actor.id]
  if (clientId) return [(await assertClientAccess(db, actor, clientId)).id]
  if (actor.role === 'ADMIN') return null // every client
  const mine = await db.user.findMany({ where: { role: 'CLIENT', consultantId: actor.id }, select: { id: true } })
  return mine.map((c) => c.id)
}

/**
 * Unread messages from people, per thread, for threads the viewer takes part in.
 * System notes show in the thread but don't raise the badge (P39) — many record
 * the viewer's own actions ("Malaika asked for an alternative…").
 */
async function unreadByThread(db: Db, userId: string, threadIds: string[]) {
  if (threadIds.length === 0) return new Map<string, number>()
  const rows = await db.$queryRaw<{ threadId: string; n: number }[]>`
    SELECT m."threadId", count(*)::int AS n
    FROM "Message" m
    JOIN "ThreadParticipant" tp ON tp."threadId" = m."threadId" AND tp."userId" = ${userId}::uuid
    WHERE m."threadId" = ANY(${threadIds}::uuid[])
      AND m."deletedAt" IS NULL
      AND m."kind" = 'USER'
      AND m."authorId" IS DISTINCT FROM ${userId}::uuid
      AND (tp."lastReadMessageId" IS NULL OR m."id" > tp."lastReadMessageId")
    GROUP BY m."threadId"`
  return new Map(rows.map((r) => [r.threadId, r.n]))
}

const INBOX_LIMIT = 100

/** Cheap check before taking the thread lock: a general thread plus one per live event. */
async function threadsMissing(db: Db, clientId: string) {
  const [threads, events] = await Promise.all([
    db.thread.findMany({ where: { clientId }, select: { eventId: true } }),
    db.event.findMany({ where: { clientId, status: { not: 'ARCHIVED' } }, select: { id: true } }),
  ])
  const have = new Set(threads.map((t) => t.eventId))
  return !have.has(null) || events.some((e) => !have.has(e.id))
}

/** Newest message of each thread, in two queries. */
async function latestMessages(db: Db, threadIds: string[]) {
  if (threadIds.length === 0) return new Map<string, MessageDto>()
  const newest = await db.$queryRaw<{ id: string }[]>`
    SELECT DISTINCT ON (m."threadId") m."id"
    FROM "Message" m
    WHERE m."threadId" = ANY(${threadIds}::uuid[]) AND m."deletedAt" IS NULL
    ORDER BY m."threadId", m."id" DESC`
  const rows = await db.message.findMany({ where: { id: { in: newest.map((r) => r.id) } }, include: { author: { select: personSelect } } })
  return new Map(rows.map((m) => [m.threadId, toMessageDto(m)]))
}

export async function listThreads(db: Db, actor: Actor, query: { clientId?: string }): Promise<ThreadDto[]> {
  const clientIds = await inboxClientIds(db, actor, query.clientId)
  // Threads missing for one client (e.g. an event created by staff before Step 10) are added on first look.
  if (clientIds?.length === 1 && (await threadsMissing(db, clientIds[0]))) await ensureThreads(db, clientIds[0])

  const threads = await db.thread.findMany({
    where: {
      AND: [
        clientIds
          ? { OR: [{ clientId: { in: clientIds } }, ...(actor.role === 'CLIENT' ? [] : [{ participants: { some: { userId: actor.id } } }])] }
          : {},
        // Archived events leave the inbox with the rest of the event (unarchiving brings them back).
        { OR: [{ eventId: null }, { event: { deletedAt: null, status: { not: 'ARCHIVED' } } }] },
      ],
    },
    include: { participants: { include: { user: { select: personSelect } }, orderBy: { joinedAt: 'asc' } } },
    orderBy: { lastMessageAt: 'desc' },
    take: INBOX_LIMIT,
  })
  const ids = threads.map((t) => t.id)
  const [unread, clients, lastMessages] = await Promise.all([
    unreadByThread(db, actor.id, ids),
    db.user.findMany({ where: { id: { in: [...new Set(threads.map((t) => t.clientId))] }, deletedAt: {} }, select: { id: true, name: true } }),
    latestMessages(db, ids),
  ])
  const clientName = new Map(clients.map((c) => [c.id, c.name]))

  const rows = threads.map((t) => ({
    id: t.id,
    clientId: t.clientId,
    clientName: clientName.get(t.clientId) ?? 'Client',
    eventId: t.eventId,
    title: t.title,
    participants: t.participants.map((p) => ({ ...toPerson(p.user), lastReadMessageId: p.lastReadMessageId })),
    lastMessage: lastMessages.get(t.id) ?? null,
    lastMessageAt: t.lastMessageAt.toISOString(),
    unread: unread.get(t.id) ?? 0,
  }))
  // Conversations with messages first (newest first), then the empty ones.
  return rows.sort((a, b) => (b.lastMessage?.id ?? '').localeCompare(a.lastMessage?.id ?? ''))
}

export async function listMessages(db: Db, actor: Actor, threadId: string, query: { before?: string; limit: number }) {
  await assertThreadAccess(db, actor, threadId)
  const rows = await db.message.findMany({
    where: { threadId, deletedAt: null, ...(query.before ? { id: { lt: query.before } } : {}) },
    orderBy: { id: 'desc' },
    take: query.limit + 1,
    include: { author: { select: personSelect } },
  })
  const more = rows.length > query.limit
  const page = more ? rows.slice(0, query.limit) : rows
  return { messages: page.map(toMessageDto), nextBefore: more ? page[page.length - 1].id : null }
}

/** Moves the reader's pointer forward only (an old tab can't mark newer messages unread). */
async function advanceRead(db: Db, threadId: string, userId: string, messageId: string) {
  const res = await db.threadParticipant.updateMany({
    where: { threadId, userId, OR: [{ lastReadMessageId: null }, { lastReadMessageId: { lt: messageId } }] },
    data: { lastReadMessageId: messageId, lastReadAt: new Date() },
  })
  return res.count > 0
}

export async function sendMessage(
  deps: { db: Db; realtime: Realtime },
  actor: Actor,
  threadId: string,
  input: { body: string; clientMessageId: string; attachmentFileIds?: string[] },
) {
  const { db } = deps
  const thread = await assertThreadAccess(db, actor, threadId)
  if (input.attachmentFileIds?.length) {
    throw new AppError('ATTACHMENTS_UNAVAILABLE', 422, 'Attachments arrive with file uploads — send the message on its own for now')
  }

  const existing = () =>
    db.message.findUnique({
      where: { authorId_clientMessageId: { authorId: actor.id, clientMessageId: input.clientMessageId } },
      include: { author: { select: personSelect } },
    })
  const replay = await existing()
  if (replay) {
    if (replay.threadId !== thread.id) throw new AppError('DUPLICATE_MESSAGE_ID', 409, 'That message id was already used')
    return toMessageDto(replay)
  }

  let message
  try {
    message = await db.$transaction(async (tx) => {
      const m = await tx.message.create({
        data: { threadId: thread.id, authorId: actor.id, kind: 'USER', body: input.body, clientMessageId: input.clientMessageId },
        include: { author: { select: personSelect } },
      })
      await tx.thread.update({ where: { id: thread.id }, data: { lastMessageAt: m.createdAt } })
      // Staff who weren't in the thread yet (admins) join on their first reply.
      await tx.threadParticipant.upsert({
        where: { threadId_userId: { threadId: thread.id, userId: actor.id } },
        create: { threadId: thread.id, userId: actor.id, lastReadMessageId: m.id, lastReadAt: m.createdAt },
        update: { lastReadMessageId: m.id, lastReadAt: m.createdAt },
      })
      return m
    })
  } catch (err) {
    // Two retries raced: the first one won, hand back its message.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const won = await existing()
      if (won) return toMessageDto(won)
    }
    throw err
  }
  return toMessageDto(message)
}

export async function markRead(deps: { db: Db; realtime: Realtime }, actor: Actor, threadId: string, messageId: string) {
  const { db } = deps
  await assertThreadAccess(db, actor, threadId)
  const message = await db.message.findFirst({ where: { id: messageId, threadId } })
  if (!message) throw new AppError('MESSAGE_NOT_FOUND', 404, 'Message not found')
  // Only people in the conversation have read state; an admin looking in doesn't.
  if (await advanceRead(db, threadId, actor.id, messageId)) {
    await deps.realtime.publish({ t: 'read', threadId, userId: actor.id, messageId })
  }
}

export async function unreadCount(db: Db, actor: Actor) {
  const [row] = await db.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n
    FROM "ThreadParticipant" tp
    JOIN "Message" m ON m."threadId" = tp."threadId"
    WHERE tp."userId" = ${actor.id}::uuid
      AND m."deletedAt" IS NULL
      AND m."kind" = 'USER'
      AND m."authorId" IS DISTINCT FROM ${actor.id}::uuid
      AND (tp."lastReadMessageId" IS NULL OR m."id" > tp."lastReadMessageId")`
  return { unread: row?.n ?? 0 }
}
