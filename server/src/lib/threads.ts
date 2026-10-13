import type { Prisma } from '../generated/prisma/client'
import type { Db, DbTx } from '../plugins/db'
import { eventTypeFromDb } from './enums'

/**
 * Conversation threads (docs/step-10-chat-activity.md, P36).
 * Every client has one general thread ("Elation Studio") and one thread per
 * event ("<Concept> · <Type>"), each with the client and their consultant.
 * Threads are created when the invite is accepted / the event is created, and
 * `ensureThreads` back-fills them (accounts and events from before Step 10).
 */

export const GENERAL_THREAD_TITLE = 'Elation Studio'

export function eventThreadTitle(event: { concept: string | null; name: string; type: Parameters<typeof eventTypeFromDb>[0] }) {
  return `${event.concept ?? event.name} · ${eventTypeFromDb(event.type)}`
}

/** Serialises thread creation for one client so concurrent calls can't duplicate threads. */
async function lockClient(tx: DbTx, clientId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`threads:${clientId}`}))`
}

async function addParticipants(tx: DbTx, threadId: string, userIds: (string | null)[]) {
  const ids = userIds.filter((u): u is string => Boolean(u))
  if (ids.length === 0) return
  await tx.threadParticipant.createMany({ data: ids.map((userId) => ({ threadId, userId })), skipDuplicates: true })
}

/**
 * Creates the client's general thread and a thread for each live event when
 * missing, and makes sure the current consultant takes part in all of them.
 * Must run inside a transaction (takes an advisory lock).
 */
export async function ensureThreadsTx(tx: DbTx, clientId: string) {
  await lockClient(tx, clientId)
  const client = await tx.user.findUnique({ where: { id: clientId }, select: { id: true, role: true, consultantId: true } })
  if (!client || client.role !== 'CLIENT') return
  const [threads, events] = await Promise.all([
    tx.thread.findMany({ where: { clientId }, select: { id: true, eventId: true } }),
    tx.event.findMany({ where: { clientId, status: { not: 'ARCHIVED' } }, select: { id: true, concept: true, name: true, type: true } }),
  ])
  const people = [client.id, client.consultantId]

  if (!threads.some((t) => t.eventId === null)) {
    const general = await tx.thread.create({ data: { clientId, title: GENERAL_THREAD_TITLE } })
    threads.push({ id: general.id, eventId: null })
  }
  const withThread = new Set(threads.map((t) => t.eventId))
  for (const e of events) {
    if (withThread.has(e.id)) continue
    const t = await tx.thread.create({ data: { clientId, eventId: e.id, title: eventThreadTitle(e) } })
    threads.push({ id: t.id, eventId: e.id })
  }
  for (const t of threads) await addParticipants(tx, t.id, people)
}

export async function ensureThreads(db: Db, clientId: string) {
  await db.$transaction((tx) => ensureThreadsTx(tx, clientId))
}

/**
 * A SYSTEM message in the client's conversation with Elation — the event's
 * thread when there is an event, else the general thread (created if needed).
 */
export async function postSystemMessage(
  db: Db | DbTx,
  input: { clientId: string; eventId?: string | null; body: string; meta: Prisma.InputJsonValue },
) {
  const find = () =>
    db.thread.findFirst({
      where: { clientId: input.clientId, eventId: input.eventId ?? null },
      orderBy: { createdAt: 'asc' },
    })
  let thread = await find()
  if (!thread) {
    if ('$transaction' in db) await ensureThreads(db, input.clientId)
    else await ensureThreadsTx(db, input.clientId)
    thread = await find()
    // An archived event has no thread of its own: fall back to the general thread.
    thread ??= await db.thread.findFirst({ where: { clientId: input.clientId, eventId: null }, orderBy: { createdAt: 'asc' } })
  }
  if (!thread) return null
  const message = await db.message.create({ data: { threadId: thread.id, kind: 'SYSTEM', body: input.body, meta: input.meta } })
  await db.thread.update({ where: { id: thread.id }, data: { lastMessageAt: message.createdAt } })
  return message
}
