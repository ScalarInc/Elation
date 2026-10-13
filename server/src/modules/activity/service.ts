import type { ActivityDto, ActivityKindDto } from '@elation/shared/api'
import type { ActivityEntry, Prisma, User } from '../../generated/prisma/client'
import { assertClientAccess, assertEventAccess } from '../../lib/policy'
import type { Db } from '../../plugins/db'

type Actor = Pick<User, 'id' | 'role'>

/** Activity feed (docs/step-10-chat-activity.md). Entries are written by each module's service. */

export function toActivityDto(a: ActivityEntry): ActivityDto {
  return {
    id: a.id,
    clientId: a.clientId,
    eventId: a.eventId,
    kind: a.kind.toLowerCase() as ActivityKindDto,
    title: a.title,
    detail: a.detail,
    at: a.createdAt.toISOString(),
  }
}

export async function listActivity(
  db: Db,
  actor: Actor,
  query: { eventId?: string; clientId?: string; cursor?: string; limit: number },
) {
  const where: Prisma.ActivityEntryWhereInput[] = []
  if (query.eventId) {
    const event = await assertEventAccess(db, actor, query.eventId)
    where.push({ eventId: event.id })
  } else if (actor.role === 'CLIENT') {
    where.push({ clientId: actor.id })
  } else if (query.clientId) {
    where.push({ clientId: (await assertClientAccess(db, actor, query.clientId)).id })
  } else if (actor.role === 'CONSULTANT') {
    const mine = await db.user.findMany({ where: { role: 'CLIENT', consultantId: actor.id }, select: { id: true } })
    where.push({ clientId: { in: mine.map((c) => c.id) } })
  }
  // Entries of archived or deleted events stay out of the feed.
  where.push({ OR: [{ eventId: null }, { event: { deletedAt: null, status: { not: 'ARCHIVED' } } }] })
  if (query.cursor) where.push({ id: { lt: query.cursor } })

  const rows = await db.activityEntry.findMany({ where: { AND: where }, orderBy: { id: 'desc' }, take: query.limit + 1 })
  const more = rows.length > query.limit
  const page = more ? rows.slice(0, query.limit) : rows
  return { entries: page.map(toActivityDto), nextCursor: more ? page[page.length - 1].id : null }
}
