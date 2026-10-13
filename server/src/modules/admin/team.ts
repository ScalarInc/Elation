import type { TeamMemberDto } from '@elation/shared/api'
import type { User } from '../../generated/prisma/client'
import { AppError } from '../../lib/errors'
import { ensureThreads } from '../../lib/threads'
import type { Db } from '../../plugins/db'
import type { Realtime } from '../../plugins/realtime'
import { deleteUserSessions } from '../auth/sessions'
import { audit } from './audit'
import { clientStatus } from './clients'

type Actor = Pick<User, 'id' | 'role'>

/** The Elation team (admin only — docs/step-12-admin.md). */

export async function listTeam(db: Db): Promise<TeamMemberDto[]> {
  const staff = await db.user.findMany({
    where: { role: { in: ['CONSULTANT', 'ADMIN'] } },
    include: { _count: { select: { clients: { where: { deletedAt: null } } } } },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  })
  return staff.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role === 'ADMIN' ? 'admin' : 'consultant',
    status: clientStatus(u),
    clientCount: u._count.clients,
    lastActiveAt: u.lastActiveAt?.toISOString() ?? null,
  }))
}

/**
 * Role change, (de)activation and moving all of someone's clients. Deactivating
 * requires their clients to be moved first, and nobody can remove the last admin
 * or deactivate themselves.
 */
export async function updateStaff(
  deps: { db: Db; realtime?: Realtime },
  actor: Actor,
  id: string,
  body: { role?: 'consultant' | 'admin'; active?: boolean; reassignClientsTo?: string },
  meta: { ip?: string },
) {
  const { db } = deps
  const member = /^[0-9a-f-]{36}$/i.test(id) ? await db.user.findFirst({ where: { id, role: { in: ['CONSULTANT', 'ADMIN'] } } }) : null
  if (!member) throw new AppError('STAFF_NOT_FOUND', 404, 'Team member not found')
  if (member.id === actor.id && (body.active === false || body.role === 'consultant')) {
    throw new AppError('SELF_CHANGE', 422, 'Ask another admin to change your own access')
  }
  const losingAdmin = member.role === 'ADMIN' && (body.role === 'consultant' || body.active === false)
  if (losingAdmin && (await db.user.count({ where: { role: 'ADMIN', status: 'ACTIVE', id: { not: member.id } } })) === 0) {
    throw new AppError('LAST_ADMIN', 422, 'Elation needs at least one admin')
  }

  let target: User | null = null
  if (body.reassignClientsTo) {
    target = await db.user.findFirst({ where: { id: body.reassignClientsTo, role: { in: ['CONSULTANT', 'ADMIN'] }, status: 'ACTIVE' } })
    if (!target || target.id === member.id) throw new AppError('CONSULTANT_NOT_FOUND', 422, 'Choose another active consultant')
  }
  if (body.active === false && !target && (await db.user.count({ where: { consultantId: member.id, role: 'CLIENT', deletedAt: null } })) > 0) {
    throw new AppError('HAS_CLIENTS', 422, 'Move their clients to another consultant first')
  }

  const moved = await db.$transaction(async (tx) => {
    // One staff change at a time: the "last admin" check can't race another admin's change.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('elation:staff'))`
    if (losingAdmin && (await tx.user.count({ where: { role: 'ADMIN', status: 'ACTIVE', id: { not: member.id } } })) === 0) {
      throw new AppError('LAST_ADMIN', 422, 'Elation needs at least one admin')
    }
    const moved = target ? await tx.user.findMany({ where: { consultantId: member.id, role: 'CLIENT' }, select: { id: true } }) : []
    if (target && moved.length) {
      await tx.user.updateMany({ where: { id: { in: moved.map((c) => c.id) } }, data: { consultantId: target.id } })
      await tx.threadParticipant.deleteMany({ where: { userId: member.id, thread: { clientId: { in: moved.map((c) => c.id) } } } })
    }
    await tx.user.update({
      where: { id: member.id },
      data: {
        role: body.role ? (body.role === 'admin' ? 'ADMIN' : 'CONSULTANT') : undefined,
        status: body.active === undefined ? undefined : body.active ? (member.passwordHash ? 'ACTIVE' : 'INVITED') : 'REVOKED',
      },
    })
    await audit(tx, actor, 'staff.update', 'User', member.id, {
      before: { role: member.role, status: member.status },
      after: { ...body, movedClients: moved.length },
      ip: meta.ip,
    })
    return moved
  })
  for (const c of moved) await ensureThreads(db, c.id)
  if (body.active === false) {
    await deleteUserSessions(db, member.id)
    await deps.realtime?.recheckSessions().catch(() => 0)
  }
  return (await listTeam(db)).find((m) => m.id === member.id)!
}
