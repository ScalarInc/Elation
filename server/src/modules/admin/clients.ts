import type { AdminClientDetail, AdminClientRow, ClientStatus, ExtendBody, ListClientsQuery } from '@elation/shared/api'
import { budgetTotals } from '@elation/shared/budget'
import type { Config } from '../../config'
import type { User } from '../../generated/prisma/client'
import { accessExtendedEmail, formatPkDate } from '../../lib/emails'
import { eventTypeFromDb } from '../../lib/enums'
import { AppError } from '../../lib/errors'
import type { Mailer } from '../../lib/mailer'
import { assertClientAccess, clientScope } from '../../lib/policy'
import { ensureThreads, postSystemMessage } from '../../lib/threads'
import type { Db } from '../../plugins/db'
import type { Realtime } from '../../plugins/realtime'
import { deleteUserSessions } from '../auth/sessions'
import { dataDeletionDate } from '../auth/retention'
import { audit, auditFor } from './audit'
import { toNoteDto } from './notes'
import { getSettings } from './settings'

type Actor = Pick<User, 'id' | 'role'>
type Deps = { db: Db; config: Config; mailer: Mailer; realtime?: Realtime; log?: { warn: (o: object, m: string) => void } }
type Meta = { ip?: string }

const DAY_MS = 24 * 60 * 60 * 1000

/** Clients (docs/step-12-admin.md). Consultants see and act on their own clients only (P18). */

export function clientStatus(u: Pick<User, 'status' | 'accessExpiresAt'>, now = new Date()): ClientStatus {
  if (u.status === 'REVOKED') return 'revoked'
  if (u.status === 'INVITED') return 'invited'
  if (u.status === 'EXPIRED' || (u.accessExpiresAt && u.accessExpiresAt <= now)) return 'expired'
  return 'active'
}

const STATUS_WHERE = {
  invited: { status: 'INVITED' as const },
  revoked: { status: 'REVOKED' as const },
  active: { status: 'ACTIVE' as const, OR: [{ accessExpiresAt: null }, { accessExpiresAt: { gt: new Date(0) } }] },
  expired: { status: { in: ['ACTIVE' as const, 'EXPIRED' as const] } },
}

const rowInclude = {
  consultant: { select: { id: true, name: true } },
  events: {
    where: { deletedAt: null, status: { not: 'ARCHIVED' as const } },
    select: {
      id: true,
      name: true,
      concept: true,
      type: true,
      date: true,
      questionnaire: { select: { percentComplete: true } },
      budgetPlan: { select: { quotes: { where: { status: { in: ['OPEN' as const, 'IN_REVIEW' as const] } }, select: { id: true } } } },
    },
  },
}

type RowSource = User & {
  consultant: { id: string; name: string } | null
  events: {
    id: string
    name: string
    concept: string | null
    type: Parameters<typeof eventTypeFromDb>[0]
    date: Date | null
    questionnaire: { percentComplete: number } | null
    budgetPlan: { quotes: { id: string }[] } | null
  }[]
}

/** The next upcoming event, else the most recent one. */
function primaryEvent(events: RowSource['events'], now = new Date()) {
  const dated = events.filter((e) => e.date).sort((a, b) => a.date!.getTime() - b.date!.getTime())
  return dated.find((e) => e.date! >= new Date(now.getTime() - DAY_MS)) ?? dated.at(-1) ?? events[0] ?? null
}

function toRow(u: RowSource, now = new Date()): AdminClientRow {
  const primary = primaryEvent(u.events, now)
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    status: clientStatus(u, now),
    accessExpiresAt: u.accessExpiresAt?.toISOString() ?? null,
    lastActiveAt: u.lastActiveAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
    consultant: u.consultant,
    primaryEvent: primary
      ? { id: primary.id, name: primary.concept ?? primary.name, type: eventTypeFromDb(primary.type), date: primary.date?.toISOString().slice(0, 10) ?? null }
      : null,
    eventCount: u.events.length,
    questionnairePercent: primary?.questionnaire?.percentComplete ?? 0,
    hasOpenQuote: u.events.some((e) => (e.budgetPlan?.quotes.length ?? 0) > 0),
  }
}

export async function listClients(db: Db, actor: Actor, query: ListClientsQuery) {
  const q = query.q?.trim()
  const rows = (await db.user.findMany({
    where: {
      AND: [
        clientScope(actor),
        query.consultantId ? { consultantId: query.consultantId } : {},
        q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] } : {},
        query.status ? STATUS_WHERE[query.status] : {},
      ],
    },
    include: rowInclude,
  })) as RowSource[]
  const now = new Date()
  // Elation has hundreds of clients, not millions: filter the derived status and sort in memory.
  let list = rows.map((r) => toRow(r, now))
  if (query.status) list = list.filter((r) => r.status === query.status)
  const sorters: Record<string, (a: AdminClientRow, b: AdminClientRow) => number> = {
    recent: (a, b) => b.createdAt.localeCompare(a.createdAt),
    name: (a, b) => a.name.localeCompare(b.name),
    expiry: (a, b) => (a.accessExpiresAt ?? '9999').localeCompare(b.accessExpiresAt ?? '9999'),
    event: (a, b) => (a.primaryEvent?.date ?? '9999').localeCompare(b.primaryEvent?.date ?? '9999'),
  }
  list.sort(sorters[query.sort ?? 'recent'])
  const start = query.cursor ?? 0
  const limit = query.limit ?? 50
  const page = list.slice(start, start + limit)
  return { rows: page, total: list.length, nextCursor: start + limit < list.length ? start + limit : null }
}

export async function getClientDetail(db: Db, actor: Actor, clientId: string, retentionDays: number): Promise<AdminClientDetail> {
  await assertClientAccess(db, actor, clientId)
  const u = (await db.user.findUniqueOrThrow({ where: { id: clientId }, include: rowInclude })) as RowSource
  const [events, notes, threads, access] = await Promise.all([
    db.event.findMany({
      where: { clientId },
      orderBy: [{ date: 'asc' }],
      include: {
        questionnaire: { select: { percentComplete: true } },
        _count: { select: { moodboards: { where: { status: { not: 'ARCHIVED' } } } } },
        budgetPlan: { include: { lines: true, quotes: { orderBy: { createdAt: 'desc' } } } },
      },
    }),
    db.consultantNote.findMany({ where: { clientId }, orderBy: { createdAt: 'desc' }, include: { author: { select: { id: true, name: true } }, client: { select: { name: true } } } }),
    db.thread.findMany({ where: { clientId }, orderBy: { lastMessageAt: 'desc' }, select: { id: true, title: true, lastMessageAt: true } }),
    auditFor(db, clientId),
  ])
  const row = toRow(u)
  return {
    ...row,
    dataDeletionAt: row.status === 'expired' && u.accessExpiresAt ? dataDeletionDate(u.accessExpiresAt, retentionDays).toISOString() : null,
    city: u.city,
    partnerName: u.partnerName,
    events: events.map((e) => ({
      id: e.id,
      name: e.concept ?? e.name,
      type: eventTypeFromDb(e.type),
      date: e.date?.toISOString().slice(0, 10) ?? null,
      status: e.status.toLowerCase(),
      guests: e.guests,
      questionnairePercent: e.questionnaire?.percentComplete ?? 0,
      moodboards: e._count.moodboards,
      budget: e.budgetPlan
        ? { totalPkr: budgetTotals(e.budgetPlan.lines).includedPkr, targetPkr: e.budgetPlan.targetPkr, status: e.budgetPlan.status.toLowerCase() }
        : null,
    })),
    quotes: events.flatMap((e) =>
      (e.budgetPlan?.quotes ?? []).map((q) => ({
        id: q.id,
        eventId: e.id,
        eventName: e.concept ?? e.name,
        status: q.status.toLowerCase(),
        totalPkr: (q.snapshot as { totalPkr?: number }).totalPkr ?? 0,
        createdAt: q.createdAt.toISOString(),
      })),
    ),
    notes: notes.map(toNoteDto),
    threads: threads.map((t) => ({ id: t.id, title: t.title, lastMessageAt: t.lastMessageAt.toISOString() })),
    access,
  }
}

// ─────────────── Access ───────────────

const adminOnly = (actor: Actor, what: string) => {
  if (actor.role !== 'ADMIN') throw new AppError('ADMIN_ONLY', 403, `Only an Elation admin can ${what}`)
}

/**
 * Extend access by `days` (from today, or from the current expiry if later) or
 * to a date. Consultants may give up to `consultantMaxExtendDays` at a time.
 * Reactivates an expired client; a revoked one must be restored first.
 */
export async function extendAccess(deps: Deps, actor: Actor, clientId: string, body: ExtendBody, meta: Meta) {
  await extendCore(deps, actor, clientId, body, meta)
  return getClientDetail(deps.db, actor, clientId, deps.config.EXPIRED_DATA_RETENTION_DAYS)
}

async function extendCore(deps: Deps, actor: Actor, clientId: string, body: ExtendBody, meta: Meta) {
  await assertClientAccess(deps.db, actor, clientId)
  const { consultantMaxExtendDays } = await getSettings(deps.db, deps.config)
  const { client, until } = await deps.db.$transaction(async (tx) => {
    // Row lock: two extensions at once add up instead of overwriting each other.
    await tx.$executeRaw`SELECT 1 FROM "User" WHERE "id" = ${clientId}::uuid FOR UPDATE`
    const client = await tx.user.findUniqueOrThrow({ where: { id: clientId } })
    if (client.status === 'REVOKED') throw new AppError('CLIENT_REVOKED', 422, 'Restore this account before extending it')
    if (client.status === 'INVITED') throw new AppError('NOT_ACTIVATED', 422, 'This client hasn’t activated yet — resend the invite instead')
    const now = new Date()
    const from = client.accessExpiresAt && client.accessExpiresAt > now ? client.accessExpiresAt : now
    const until = body.until ? new Date(`${body.until}T23:59:59.000+05:00`) : new Date(from.getTime() + body.days! * DAY_MS)
    if (!(until > now)) throw new AppError('DATE_IN_PAST', 422, 'Choose a date in the future')
    if (actor.role === 'CONSULTANT') {
      const added = (until.getTime() - Math.max(now.getTime(), client.accessExpiresAt?.getTime() ?? 0)) / DAY_MS
      if (added > consultantMaxExtendDays + 0.01) {
        throw new AppError('EXTEND_LIMIT', 403, `Consultants can extend by up to ${consultantMaxExtendDays} days at a time — ask an admin for more`)
      }
    }
    await tx.user.update({ where: { id: clientId }, data: { accessExpiresAt: until, status: 'ACTIVE' } })
    await audit(tx, actor, 'user.extend', 'User', clientId, {
      before: { accessExpiresAt: client.accessExpiresAt?.toISOString() ?? null, status: client.status },
      after: { accessExpiresAt: until.toISOString(), status: 'ACTIVE' },
      ip: meta.ip,
    })
    await tx.activityEntry.create({ data: { clientId, actorId: actor.id, kind: 'SYSTEM', title: `Access extended to ${formatPkDate(until)}` } })
    await postSystemMessage(tx, { clientId, body: `Your access has been extended to ${formatPkDate(until)}.`, meta: { type: 'access.extended', until: until.toISOString() } })
    return { client, until }
  })
  await deps.mailer
    .send(accessExtendedEmail({ to: client.email, name: client.name, until, url: `${deps.config.APP_URL}/dashboard` }))
    .catch((err: unknown) => deps.log?.warn({ err, clientId }, 'access-extended email failed'))
}

/** Admin only: closes the account now — every session ends, open sockets close, open invites die. */
export async function revokeClient(deps: Deps, actor: Actor, clientId: string, reason: string, meta: Meta) {
  await revokeCore(deps, actor, clientId, reason, meta)
  return getClientDetail(deps.db, actor, clientId, deps.config.EXPIRED_DATA_RETENTION_DAYS)
}

async function revokeCore(deps: Deps, actor: Actor, clientId: string, reason: string, meta: Meta) {
  adminOnly(actor, 'close an account')
  const client = await assertClientAccess(deps.db, actor, clientId)
  if (client.status === 'REVOKED') return
  await deps.db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: clientId }, data: { status: 'REVOKED' } })
    await tx.invite.updateMany({ where: { userId: clientId, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } })
    await audit(tx, actor, 'user.revoke', 'User', clientId, { before: { status: client.status }, after: { status: 'REVOKED', reason }, ip: meta.ip })
  })
  await deleteUserSessions(deps.db, clientId)
  await deps.realtime?.recheckSessions().catch(() => 0)
}

/** Admin only: re-opens a closed account (active again if its access window is still open). */
export async function restoreClient(deps: Deps, actor: Actor, clientId: string, meta: Meta) {
  adminOnly(actor, 'restore an account')
  const client = await assertClientAccess(deps.db, actor, clientId)
  if (client.status !== 'REVOKED') throw new AppError('NOT_REVOKED', 422, 'This account isn’t closed')
  const status = client.passwordHash ? (client.accessExpiresAt && client.accessExpiresAt > new Date() ? 'ACTIVE' : 'EXPIRED') : 'INVITED'
  await deps.db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: clientId }, data: { status } })
    await audit(tx, actor, 'user.restore', 'User', clientId, { before: { status: 'REVOKED' }, after: { status }, ip: meta.ip })
  })
  return getClientDetail(deps.db, actor, clientId, deps.config.EXPIRED_DATA_RETENTION_DAYS)
}

/**
 * Contact details (staff with access) and consultant reassignment (admin only).
 * A reassigned client's threads get the new consultant; the previous one leaves
 * them and loses access (P49) — the history stays in the threads.
 */
export async function updateClient(
  deps: Deps,
  actor: Actor,
  clientId: string,
  body: { name?: string; phone?: string | null; consultantId?: string },
  meta: Meta,
) {
  const client = await assertClientAccess(deps.db, actor, clientId)
  const reassign = body.consultantId && body.consultantId !== client.consultantId
  if (reassign) adminOnly(actor, 'move a client to another consultant')
  const next = reassign
    ? await deps.db.user.findFirst({ where: { id: body.consultantId, role: { in: ['CONSULTANT', 'ADMIN'] }, status: 'ACTIVE' } })
    : null
  if (reassign && !next) throw new AppError('CONSULTANT_NOT_FOUND', 422, 'Choose an active consultant')

  await deps.db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: clientId },
      data: { name: body.name, phone: body.phone === undefined ? undefined : body.phone, consultantId: reassign ? next!.id : undefined },
    })
    if (reassign && client.consultantId) {
      await tx.threadParticipant.deleteMany({ where: { userId: client.consultantId, thread: { clientId } } })
    }
    await audit(tx, actor, reassign ? 'user.reassign' : 'user.update', 'User', clientId, {
      before: { name: client.name, phone: client.phone, consultantId: client.consultantId },
      after: { name: body.name ?? client.name, phone: body.phone === undefined ? client.phone : body.phone, consultantId: reassign ? next!.id : client.consultantId },
      ip: meta.ip,
    })
  })
  if (reassign) {
    await ensureThreads(deps.db, clientId)
    await postSystemMessage(deps.db, { clientId, body: `${next!.name} is now your Elation consultant.`, meta: { type: 'consultant.changed', consultantId: next!.id } })
  }
  return getClientDetail(deps.db, actor, clientId, deps.config.EXPIRED_DATA_RETENTION_DAYS)
}

export async function bulkClients(
  deps: Deps,
  actor: Actor,
  body: { ids: string[]; action: 'extend' | 'revoke'; days?: number; reason?: string },
  meta: Meta,
) {
  if (body.action === 'extend' && !body.days) throw new AppError('DAYS_REQUIRED', 422, 'How many days?')
  if (body.action === 'revoke') {
    adminOnly(actor, 'close accounts')
    if (!body.reason?.trim()) throw new AppError('REASON_REQUIRED', 422, 'Say why these accounts are being closed')
  }
  const done: string[] = []
  const failed: { id: string; message: string }[] = []
  for (const id of new Set(body.ids)) {
    try {
      if (body.action === 'extend') await extendCore(deps, actor, id, { days: body.days }, meta)
      else await revokeCore(deps, actor, id, body.reason || 'Bulk revoke', meta)
      done.push(id)
    } catch (err) {
      failed.push({ id, message: err instanceof AppError ? err.message : 'Something went wrong' })
    }
  }
  return { done, failed }
}
