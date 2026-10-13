import type { Prisma, User } from '../generated/prisma/client'
import type { Db } from '../plugins/db'
import { AppError } from './errors'

/**
 * Authorization rules (docs/step-03-auth.md, decision P18).
 * Resources a user may not see are reported as 404, never 403, so IDs can't
 * be probed. Every event-, client- and thread-scoped route goes through here.
 */

type Actor = Pick<User, 'id' | 'role'>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Prisma `where` limiting events to what the actor may see.
 * Always combine with AND — spreading a scope into a where object can silently
 * overwrite the caller's own `id` filter.
 */
export function eventScope(actor: Actor): Prisma.EventWhereInput {
  switch (actor.role) {
    case 'CLIENT':
      return { clientId: actor.id }
    case 'CONSULTANT':
      return { client: { consultantId: actor.id } }
    case 'ADMIN':
      return {}
  }
}

/** Prisma `where` limiting client accounts to what the actor may see. */
export function clientScope(actor: Actor): Prisma.UserWhereInput {
  switch (actor.role) {
    case 'CLIENT':
      return { id: actor.id }
    case 'CONSULTANT':
      return { role: 'CLIENT', consultantId: actor.id }
    case 'ADMIN':
      return { role: 'CLIENT' }
  }
}

export async function assertEventAccess(db: Db, actor: Actor, eventId: string) {
  const event = UUID.test(eventId)
    ? await db.event.findFirst({ where: { AND: [{ id: eventId }, eventScope(actor)] } })
    : null
  if (!event) throw new AppError('EVENT_NOT_FOUND', 404, 'Event not found')
  return event
}

export async function assertClientAccess(db: Db, actor: Actor, clientId: string) {
  const client = UUID.test(clientId)
    ? await db.user.findFirst({ where: { AND: [{ id: clientId }, clientScope(actor)] } })
    : null
  if (!client) throw new AppError('CLIENT_NOT_FOUND', 404, 'Client not found')
  return client
}

export async function assertThreadAccess(db: Db, actor: Actor, threadId: string) {
  const thread = UUID.test(threadId) ? await db.thread.findUnique({ where: { id: threadId } }) : null
  if (thread) {
    if (actor.role === 'ADMIN') return thread
    if (actor.role === 'CLIENT' && thread.clientId === actor.id) return thread
    if (actor.role === 'CONSULTANT') {
      const isParticipant = await db.threadParticipant.findUnique({
        where: { threadId_userId: { threadId, userId: actor.id } },
      })
      if (isParticipant) return thread
      const ownsClient = await db.user.findFirst({ where: { id: thread.clientId, consultantId: actor.id } })
      if (ownsClient) return thread
    }
  }
  throw new AppError('THREAD_NOT_FOUND', 404, 'Conversation not found')
}
