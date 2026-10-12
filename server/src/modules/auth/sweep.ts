import type { Db } from '../../plugins/db'

/**
 * Hourly: mark clients whose access period has passed as EXPIRED and end their
 * sessions. (Requests already enforce expiry on their own — this keeps the
 * stored status accurate for admin lists and kills idle sessions.)
 *
 * Expiry warning emails and the 7-day data retention purge (owner answer A5)
 * run from the job queue once it exists — see docs/00-decisions.md.
 */
export async function expireLapsedClients(db: Db, now = new Date()): Promise<number> {
  const lapsed = await db.user.findMany({
    where: { role: 'CLIENT', status: 'ACTIVE', accessExpiresAt: { lte: now } },
    select: { id: true },
  })
  if (lapsed.length === 0) return 0
  const ids = lapsed.map((u) => u.id)
  await db.$transaction([
    db.user.updateMany({ where: { id: { in: ids } }, data: { status: 'EXPIRED' } }),
    db.session.deleteMany({ where: { userId: { in: ids } } }),
    db.auditLog.createMany({
      data: ids.map((id) => ({ action: 'user.expired', targetType: 'User', targetId: id })),
    }),
  ])
  return ids.length
}
