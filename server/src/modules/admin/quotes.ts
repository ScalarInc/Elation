import type { AdminQuoteDto } from '@elation/shared/api'
import type { QuoteStatus, User } from '../../generated/prisma/client'
import type { Config } from '../../config'
import { quoteReadyEmail } from '../../lib/emails'
import { eventTypeFromDb } from '../../lib/enums'
import { AppError } from '../../lib/errors'
import type { Mailer } from '../../lib/mailer'
import { eventScope } from '../../lib/policy'
import { postSystemMessage } from '../../lib/threads'
import type { Db } from '../../plugins/db'
import { audit } from './audit'

type Actor = Pick<User, 'id' | 'role'>
type Deps = { db: Db; config: Config; mailer: Mailer; log?: { warn: (o: object, m: string) => void } }

/** Quote requests queue (docs/step-12-admin.md). */

const include = {
  plan: { include: { event: { include: { client: { select: { id: true, name: true, email: true } } } } } },
} as const

/** A sent quote can only be closed; a closed one stays closed (the client requests a new one). */
const NEXT: Record<QuoteStatus, QuoteStatus[]> = {
  OPEN: ['IN_REVIEW', 'QUOTED', 'CLOSED'],
  IN_REVIEW: ['OPEN', 'QUOTED', 'CLOSED'],
  QUOTED: ['CLOSED'],
  CLOSED: [],
}

type Row = Awaited<ReturnType<typeof loadQuote>>
const loadQuote = (db: Db, id: string) => db.quoteRequest.findUniqueOrThrow({ where: { id }, include })

async function toDto(db: Db, q: NonNullable<Row>): Promise<AdminQuoteDto> {
  const snap = q.snapshot as { totalPkr?: number; targetPkr?: number; lines?: unknown[] }
  const handler = q.handledById ? await db.user.findUnique({ where: { id: q.handledById }, select: { id: true, name: true } }) : null
  const e = q.plan.event
  return {
    id: q.id,
    status: q.status.toLowerCase() as AdminQuoteDto['status'],
    note: q.note,
    totalPkr: snap.totalPkr ?? 0,
    targetPkr: snap.targetPkr ?? q.plan.targetPkr,
    lineCount: snap.lines?.length ?? 0,
    client: { id: e.client.id, name: e.client.name },
    event: { id: e.id, name: e.concept ?? e.name, type: eventTypeFromDb(e.type), date: e.date?.toISOString().slice(0, 10) ?? null },
    handledBy: handler,
    createdAt: q.createdAt.toISOString(),
    updatedAt: q.updatedAt.toISOString(),
  }
}

export async function listAdminQuotes(db: Db, actor: Actor, status?: string) {
  const rows = await db.quoteRequest.findMany({
    where: { plan: { event: { AND: [eventScope(actor), { deletedAt: null }] } }, ...(status ? { status: status.toUpperCase() as QuoteStatus } : {}) },
    include,
    orderBy: [{ createdAt: 'desc' }],
    take: 200,
  })
  return Promise.all(rows.map((q) => toDto(db, q)))
}

/**
 * Moves a quote along. QUOTED marks the budget plan quoted and tells the client
 * (thread message + activity + email) — `message` is included when given.
 */
export async function updateQuote(deps: Deps, actor: Actor, id: string, body: { status: string; message?: string }, meta: { ip?: string }) {
  const { db } = deps
  const quote = /^[0-9a-f-]{36}$/i.test(id)
    ? await db.quoteRequest.findFirst({ where: { id, plan: { event: { AND: [eventScope(actor), { deletedAt: null }] } } }, include })
    : null
  if (!quote) throw new AppError('QUOTE_NOT_FOUND', 404, 'Quote not found')
  const status = body.status.toUpperCase() as QuoteStatus
  if (quote.status === status) return toDto(db, quote)
  if (!NEXT[quote.status].includes(status)) {
    throw new AppError('QUOTE_STATUS', 422, quote.status === 'QUOTED' ? 'This quote was sent to the client — close it, or the client can request a new one' : 'This quote is closed')
  }
  const event = quote.plan.event
  const snap = quote.snapshot as { totalPkr?: number }

  await db.$transaction(async (tx) => {
    await tx.quoteRequest.update({ where: { id }, data: { status, handledById: actor.id } })
    if (status === 'QUOTED') {
      await tx.budgetPlan.update({ where: { id: quote.planId }, data: { status: 'QUOTED' } })
      await tx.activityEntry.create({
        data: { clientId: event.clientId, eventId: event.id, actorId: actor.id, kind: 'BUDGET', title: 'Your quote is ready', detail: body.message || null },
      })
      await postSystemMessage(tx, {
        clientId: event.clientId,
        eventId: event.id,
        body: `Elation prepared your quote for ${event.concept ?? event.name}: PKR ${(snap.totalPkr ?? 0).toLocaleString('en-PK')}.${body.message ? ` “${body.message}”` : ''}`,
        meta: { type: 'budget.quoted', eventId: event.id, quoteId: id },
      })
    }
    await audit(tx, actor, 'quote.status', 'QuoteRequest', id, { before: { status: quote.status }, after: { status, message: body.message ?? null }, ip: meta.ip })
  })
  if (status === 'QUOTED') {
    await deps.mailer
      .send(
        quoteReadyEmail({
          to: event.client.email,
          name: event.client.name,
          eventName: event.concept ?? event.name,
          totalPkr: snap.totalPkr ?? 0,
          message: body.message,
          url: `${deps.config.APP_URL}/events/${event.id}/budget`,
        }),
      )
      .catch((err: unknown) => deps.log?.warn({ err, quoteId: id }, 'quote-ready email failed'))
  }
  return toDto(db, await loadQuote(db, id))
}
