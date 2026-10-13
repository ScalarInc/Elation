import type { AuditEntryDto } from '@elation/shared/api'
import type { Prisma, User } from '../../generated/prisma/client'
import type { Db, DbTx } from '../../plugins/db'

/** Every admin mutation leaves an AuditLog row (docs/step-12-admin.md). */
export function audit(
  db: Db | DbTx,
  actor: Pick<User, 'id'> | null,
  action: string,
  targetType: string,
  targetId: string,
  opts: { before?: unknown; after?: unknown; ip?: string } = {},
) {
  return db.auditLog.create({
    data: {
      actorId: actor?.id ?? null,
      action,
      targetType,
      targetId,
      before: (opts.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (opts.after ?? undefined) as Prisma.InputJsonValue | undefined,
      ip: opts.ip,
    },
  })
}

export async function auditFor(db: Db, targetId: string, limit = 50): Promise<AuditEntryDto[]> {
  const rows = await db.auditLog.findMany({ where: { targetId }, orderBy: { createdAt: 'desc' }, take: limit })
  const actorIds = [...new Set(rows.flatMap((r) => (r.actorId ? [r.actorId] : [])))]
  const actors = new Map((await db.user.findMany({ where: { id: { in: actorIds }, deletedAt: {} }, select: { id: true, name: true } })).map((u) => [u.id, u]))
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    actor: r.actorId ? (actors.get(r.actorId) ?? { id: r.actorId, name: 'Elation' }) : null,
    before: r.before ?? null,
    after: r.after ?? null,
    at: r.createdAt.toISOString(),
  }))
}
