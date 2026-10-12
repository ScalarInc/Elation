import type { Prisma } from '../generated/prisma/client'
import type { Db, DbTx } from '../plugins/db'

/**
 * A SYSTEM message in the client's conversation with Elation — the event's
 * thread if it has one, else the client's general thread. Threads themselves
 * are created in Step 10; with none yet, the activity feed carries the news.
 */
export async function postSystemMessage(
  db: Db | DbTx,
  input: { clientId: string; eventId: string; body: string; meta: Prisma.InputJsonValue },
) {
  const thread = await db.thread.findFirst({
    where: { clientId: input.clientId, OR: [{ eventId: input.eventId }, { eventId: null }] },
    orderBy: { eventId: { sort: 'asc', nulls: 'last' } },
  })
  if (!thread) return null
  const message = await db.message.create({ data: { threadId: thread.id, kind: 'SYSTEM', body: input.body, meta: input.meta } })
  await db.thread.update({ where: { id: thread.id }, data: { lastMessageAt: message.createdAt } })
  return message
}
