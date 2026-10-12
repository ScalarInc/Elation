import type {
  AddBudgetLineBody,
  BudgetPlanDto,
  BudgetSummary,
  CreateBudgetBody,
  EventBudgetResponse,
  PutBudgetBody,
  QuoteDto,
} from '@elation/shared/api'
import {
  BUDGET_BAND_MIDPOINTS,
  budgetCategoryFor,
  budgetTotals,
  classifyBudget,
  fitToTarget,
  seedBudgetLines,
  seedQuantity,
  type SeedPick,
} from '@elation/shared/budget'
import type { Answers } from '@elation/shared/questionnaire'
import type { Event, InventoryItem, Prisma, User } from '../../generated/prisma/client'
import { inventoryCategoryFromDb, inventoryUnitFromDb } from '../../lib/enums'
import { budgetForConsultantEmail } from '../../lib/emails'
import { AppError } from '../../lib/errors'
import type { Mailer } from '../../lib/mailer'
import { assertEventAccess, eventScope } from '../../lib/policy'
import type { Db, DbTx } from '../../plugins/db'
import { eventInclude, toEventDto } from '../events/service'
import { toInventoryDto } from '../inventory/service'
import { leadMoodboard, recommendedPieces } from '../moodboards/service'

type Actor = Pick<User, 'id' | 'role'>
type Deps = { db: Db; mailer: Mailer; appUrl: string; log: { warn: (obj: object, msg: string) => void } }

/** When neither the event nor the questionnaire has a budget yet. */
const DEFAULT_TARGET_PKR = 2_500_000
/** A repeated quote request for an unchanged plan within this window returns the open request. */
const QUOTE_DEDUPE_MS = 10 * 60 * 1000

const planInclude = {
  lines: { orderBy: { position: 'asc' }, include: { inventoryItem: true } },
  quotes: { orderBy: { createdAt: 'desc' }, take: 1 },
} satisfies Prisma.BudgetPlanInclude
type PlanRow = Prisma.BudgetPlanGetPayload<{ include: typeof planInclude }>

const staffOf = (actor: Actor) => actor.role !== 'CLIENT'

type SignatureLine = { inventoryItemId: string; qty: number; included: boolean; unitPricePkr: number }
/** What a quote request froze — later edits are compared against it. */
const signature = (lines: SignatureLine[]) =>
  JSON.stringify(lines.map((l) => [l.inventoryItemId, l.qty, l.included, l.unitPricePkr]))

/** Today's price, or null when the piece can't be booked at a price any more. */
const currentPrice = (item: InventoryItem) => (item.active ? item.pricePkr : null)

export function toPlanDto(p: PlanRow, opts: { staff: boolean }): BudgetPlanDto {
  const lines = p.lines.map((l) => ({
    id: l.id,
    category: l.category,
    qty: l.qty,
    included: l.included,
    position: l.position,
    source: l.source as BudgetPlanDto['lines'][number]['source'],
    unitPricePkr: l.unitPricePkr,
    currentPricePkr: currentPrice(l.inventoryItem),
    item: toInventoryDto(l.inventoryItem, opts),
  }))
  const totals = budgetTotals(lines)
  const lastQuote = p.quotes[0]
  return {
    id: p.id,
    eventId: p.eventId,
    targetPkr: p.targetPkr,
    status: p.status.toLowerCase() as BudgetPlanDto['status'],
    seededFrom: p.seededFrom as BudgetPlanDto['seededFrom'],
    version: p.version,
    lines,
    totals,
    classification: classifyBudget(totals.includedPkr, p.targetPkr),
    pricesChanged: lines.some((l) => l.currentPricePkr != null && l.currentPricePkr !== l.unitPricePkr),
    changedSinceQuote: lastQuote ? (lastQuote.snapshot as { signature?: string }).signature !== signature(p.lines) : false,
    submittedAt: p.submittedAt?.toISOString() ?? null,
    updatedAt: p.updatedAt.toISOString(),
  }
}

async function loadPlan(db: Db | DbTx, eventId: string) {
  return db.budgetPlan.findUnique({ where: { eventId }, include: planInclude })
}

async function requirePlan(db: Db, eventId: string) {
  const plan = await loadPlan(db, eventId)
  if (!plan) throw new AppError('BUDGET_NOT_FOUND', 404, 'This event has no budget yet')
  return plan
}

async function editableEvent(db: Db, actor: Actor, eventId: string) {
  const event = await assertEventAccess(db, actor, eventId)
  if (event.status === 'ARCHIVED') throw new AppError('EVENT_ARCHIVED', 422, 'Unarchive this event first')
  return event
}

async function answersFor(db: Db | DbTx, eventId: string) {
  const q = await db.questionnaireResponse.findUnique({ where: { eventId } })
  return (q?.answers ?? {}) as Answers
}

function suggestedTarget(event: Event) {
  return event.budgetPkr ?? (event.budgetBand ? BUDGET_BAND_MIDPOINTS[event.budgetBand] : undefined) ?? DEFAULT_TARGET_PKR
}

/** Inventory items an add/seed may use: active and priced (decision P22). */
async function bookableItem(db: Db | DbTx, inventoryItemId: string) {
  const item = await db.inventoryItem.findFirst({ where: { id: inventoryItemId, active: true } })
  if (!item) throw new AppError('INVENTORY_NOT_FOUND', 404, 'That piece is no longer available')
  if (item.pricePkr == null) {
    throw new AppError('ITEM_UNPRICED', 422, `${item.name} is priced on request — ask your consultant to add it`)
  }
  return item as InventoryItem & { pricePkr: number }
}

const toSeedPick = (item: InventoryItem, area: string | null): SeedPick => ({
  item: { id: item.id, category: inventoryCategoryFromDb(item.category), unit: inventoryUnitFromDb(item.unit), pricePkr: item.pricePkr },
  area,
})

async function activity(tx: Db | DbTx, event: Event, actor: Actor, title: string, detail?: string, meta?: Prisma.InputJsonValue) {
  await tx.activityEntry.create({
    data: { clientId: event.clientId, eventId: event.id, actorId: actor.id, kind: 'BUDGET', title, detail, meta },
  })
}

// ─────────────── Reads ───────────────

export async function listBudgets(db: Db, actor: Actor): Promise<BudgetSummary[]> {
  const events = await db.event.findMany({
    where: { AND: [eventScope(actor), { status: { not: 'ARCHIVED' } }] },
    include: eventInclude,
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
  })
  const plans = await db.budgetPlan.findMany({ where: { eventId: { in: events.map((e) => e.id) } }, include: { lines: true } })
  const byEvent = new Map(plans.map((p) => [p.eventId, p]))
  return events.map((e) => {
    const plan = byEvent.get(e.id)
    if (!plan) return { event: toEventDto(e), plan: null }
    const totals = budgetTotals(plan.lines)
    return {
      event: toEventDto(e),
      plan: {
        targetPkr: plan.targetPkr,
        status: plan.status.toLowerCase() as BudgetPlanDto['status'],
        totals,
        classification: classifyBudget(totals.includedPkr, plan.targetPkr),
        lineCount: plan.lines.length,
      },
    }
  })
}

export async function getEventBudget(db: Db, actor: Actor, eventId: string): Promise<EventBudgetResponse> {
  const event = await assertEventAccess(db, actor, eventId)
  const [plan, boards] = await Promise.all([
    loadPlan(db, eventId),
    db.moodboard.count({ where: { eventId, status: { not: 'ARCHIVED' } } }),
  ])
  return {
    plan: plan ? toPlanDto(plan, { staff: staffOf(actor) }) : null,
    suggestedTargetPkr: suggestedTarget(event),
    hasMoodboard: boards > 0,
  }
}

export async function listQuotes(db: Db, actor: Actor, eventId: string): Promise<QuoteDto[]> {
  await assertEventAccess(db, actor, eventId)
  const quotes = await db.quoteRequest.findMany({ where: { plan: { eventId } }, orderBy: { createdAt: 'desc' } })
  return quotes.map(toQuoteDto)
}

function toQuoteDto(q: { id: string; status: string; note: string | null; snapshot: unknown; createdAt: Date }): QuoteDto {
  const snap = q.snapshot as { totalPkr?: number; lines?: unknown[] }
  return {
    id: q.id,
    status: q.status.toLowerCase() as QuoteDto['status'],
    note: q.note,
    totalPkr: snap.totalPkr ?? 0,
    lineCount: snap.lines?.length ?? 0,
    createdAt: q.createdAt.toISOString(),
  }
}

// ─────────────── Seeding ───────────────

type Seeded = { lines: ReturnType<typeof seedBudgetLines>['lines']; unpricedItems: { id: string; name: string }[] }

/** Lines for a new or reset plan. */
async function seedLines(db: Db, actor: Actor, event: Event, from: string, moodboardId?: string): Promise<Seeded> {
  if (from === 'blank') return { lines: [], unpricedItems: [] }
  const guests = event.guests ?? 100

  if (from === 'moodboard') {
    const board = moodboardId
      ? await db.moodboard.findFirst({ where: { id: moodboardId, eventId: event.id }, include: { tiles: { orderBy: { position: 'asc' } } } })
      : await leadMoodboard(db, event.id)
    if (!board) throw new AppError('MOODBOARD_NOT_FOUND', 404, 'This event has no moodboard to start from yet')
    const ids = board.tiles.flatMap((t) => (t.inventoryItemId ? [t.inventoryItemId] : []))
    const items = new Map((await db.inventoryItem.findMany({ where: { id: { in: ids }, active: true } })).map((i) => [i.id, i]))
    const picks = board.tiles.flatMap((t) => {
      const item = t.inventoryItemId ? items.get(t.inventoryItemId) : undefined
      return item ? [toSeedPick(item, t.area)] : []
    })
    const seeded = seedBudgetLines(picks, { guests, answers: await answersFor(db, event.id) })
    return { lines: seeded.lines, unpricedItems: seeded.unpriced.map((id) => ({ id, name: items.get(id)!.name })) }
  }

  // "Elation's recommendation" (also used for plans first seeded from fixtures).
  const { answers, picks } = await recommendedPieces(db, actor, event)
  const items = new Map((await db.inventoryItem.findMany({ where: { id: { in: picks.map((p) => p.itemId) } } })).map((i) => [i.id, i]))
  const seedPicks = picks.flatMap((p) => (items.has(p.itemId) ? [toSeedPick(items.get(p.itemId)!, p.area)] : []))
  // Seating and tables for every guest, unless the client said there's no dining set-up.
  const essentials: ['CHAIR' | 'TABLE', string][] = [['CHAIR', 'dining']]
  if (answers.q61_tables !== 'No') essentials.push(['TABLE', 'dining'])
  for (const [category, area] of essentials) {
    if (seedPicks.some((p) => p.item.category === inventoryCategoryFromDb(category))) continue
    const piece = await db.inventoryItem.findFirst({ where: { category, active: true, pricePkr: { not: null } }, orderBy: { pricePkr: 'asc' } })
    if (piece) seedPicks.push(toSeedPick(piece, area))
  }
  return { lines: seedBudgetLines(seedPicks, { guests, answers }).lines, unpricedItems: [] }
}

const lineRows = (lines: Seeded['lines'], source: string) => lines.map((l, position) => ({ ...l, position, source }))

// ─────────────── Writes ───────────────

/** Keep Event.budgetPkr equal to the plan's target (single source of truth for every card). */
async function writeTargetThrough(tx: DbTx, eventId: string, targetPkr: number) {
  await tx.event.update({ where: { id: eventId }, data: { budgetPkr: targetPkr } })
}

export async function createBudget(db: Db, actor: Actor, eventId: string, body: CreateBudgetBody) {
  const event = await editableEvent(db, actor, eventId)
  if (await db.budgetPlan.findUnique({ where: { eventId } })) {
    throw new AppError('BUDGET_EXISTS', 409, 'This event already has a budget')
  }
  const seeded = await seedLines(db, actor, event, body.seedFrom, body.moodboardId)
  const targetPkr = body.targetPkr ?? suggestedTarget(event)
  seeded.lines = fitToTarget(seeded.lines, targetPkr)
  await db.$transaction(async (tx) => {
    await tx.budgetPlan.create({
      data: {
        eventId,
        targetPkr,
        seededFrom: body.seedFrom,
        updatedById: actor.id,
        lines: { create: lineRows(seeded.lines, 'seed') },
      },
    })
    await writeTargetThrough(tx, eventId, targetPkr)
    const how = { moodboard: 'from the moodboard', rules: "from Elation's recommendation", blank: 'from scratch' }[body.seedFrom]
    await activity(tx, event, actor, `Started a budget ${how}`)
  })
  return { plan: toPlanDto((await loadPlan(db, eventId))!, { staff: staffOf(actor) }), unpricedItems: seeded.unpricedItems }
}

/** Full replace — the estimator edits locally and autosaves. Existing lines keep their price snapshot. */
export async function putBudget(db: Db, actor: Actor, eventId: string, body: PutBudgetBody) {
  await editableEvent(db, actor, eventId)
  const plan = await requirePlan(db, eventId)
  const existing = new Map(plan.lines.map((l) => [l.id, l]))

  const rows: Prisma.BudgetLineCreateManyInput[] = []
  for (const [position, l] of body.lines.entries()) {
    const kept = l.id ? existing.get(l.id) : undefined
    if (kept && kept.inventoryItemId === l.inventoryItemId) {
      rows.push({ planId: plan.id, id: kept.id, inventoryItemId: kept.inventoryItemId, unitPricePkr: kept.unitPricePkr, source: kept.source, category: l.category, qty: l.qty, included: l.included, position })
    } else {
      const item = await bookableItem(db, l.inventoryItemId)
      rows.push({ planId: plan.id, inventoryItemId: item.id, unitPricePkr: item.pricePkr, source: staffOf(actor) ? 'consultant' : 'client', category: l.category, qty: l.qty, included: l.included, position })
    }
  }

  await db.$transaction(async (tx) => {
    // Optimistic concurrency: only the holder of the current version may replace the plan.
    const bumped = await tx.budgetPlan.updateMany({
      where: { id: plan.id, version: body.version },
      data: { version: { increment: 1 }, targetPkr: body.targetPkr, updatedById: actor.id },
    })
    if (bumped.count === 0) {
      throw new AppError('VERSION_CONFLICT', 409, 'This budget changed elsewhere — reload to see the latest', { version: plan.version })
    }
    await tx.budgetLine.deleteMany({ where: { planId: plan.id } })
    await tx.budgetLine.createMany({ data: rows })
    if (body.targetPkr !== plan.targetPkr) await writeTargetThrough(tx, eventId, body.targetPkr)
  })
  return toPlanDto((await loadPlan(db, eventId))!, { staff: staffOf(actor) })
}

async function bump(tx: DbTx, planId: string, actor: Actor) {
  await tx.budgetPlan.update({ where: { id: planId }, data: { version: { increment: 1 }, updatedById: actor.id } })
}

/** Moodboard "Add to budget": one piece; creates a blank plan first if needed. Adding a piece already in the plan is a no-op. */
export async function addBudgetLine(db: Db, actor: Actor, eventId: string, body: AddBudgetLineBody) {
  const event = await editableEvent(db, actor, eventId)
  const item = await bookableItem(db, body.inventoryItemId)
  const answers = await answersFor(db, eventId)
  await db.$transaction(async (tx) => {
    // Upsert: two first clicks at once must both land in the same plan.
    const plan = await tx.budgetPlan.upsert({
      where: { eventId },
      create: { eventId, targetPkr: suggestedTarget(event), seededFrom: 'blank', updatedById: actor.id },
      update: {},
      include: planInclude,
    })
    await writeTargetThrough(tx, eventId, plan.targetPkr)
    if (plan.lines.some((l) => l.inventoryItemId === item.id)) return
    const area = body.area ?? item.tags[0] ?? null
    const category = inventoryCategoryFromDb(item.category)
    await tx.budgetLine.create({
      data: {
        planId: plan.id,
        inventoryItemId: item.id,
        category: body.category ?? budgetCategoryFor(category, area),
        qty: body.qty ?? seedQuantity({ category, unit: inventoryUnitFromDb(item.unit), area, guests: event.guests ?? 100, answers }),
        unitPricePkr: item.pricePkr,
        position: plan.lines.length,
        source: body.source ?? 'client',
      },
    })
    await bump(tx, plan.id, actor)
    await activity(tx, event, actor, `Added ${item.name} to the budget`)
  })
  return toPlanDto((await loadPlan(db, eventId))!, { staff: staffOf(actor) })
}

/** "Apply to budget" from a moodboard: every priced piece not already in the plan. */
export async function applyMoodboardToBudget(db: Db, actor: Actor, moodboardId: string) {
  const board = await db.moodboard.findFirst({ where: { id: moodboardId, event: eventScope(actor) } })
  if (!board) throw new AppError('MOODBOARD_NOT_FOUND', 404, 'Moodboard not found')
  const event = await editableEvent(db, actor, board.eventId)
  const seeded = await seedLines(db, actor, event, 'moodboard', moodboardId)
  let added = 0
  await db.$transaction(async (tx) => {
    const plan = await tx.budgetPlan.upsert({
      where: { eventId: event.id },
      create: { eventId: event.id, targetPkr: suggestedTarget(event), seededFrom: 'moodboard', updatedById: actor.id },
      update: {},
      include: planInclude,
    })
    await writeTargetThrough(tx, event.id, plan.targetPkr)
    const have = new Set(plan.lines.map((l) => l.inventoryItemId))
    const fresh = seeded.lines.filter((l) => !have.has(l.inventoryItemId))
    added = fresh.length
    if (!added) return
    await tx.budgetLine.createMany({
      data: fresh.map((l, i) => ({ ...l, planId: plan.id, position: plan.lines.length + i, source: 'moodboard' })),
    })
    await bump(tx, plan.id, actor)
    await activity(tx, event, actor, `Added ${added} ${added === 1 ? 'piece' : 'pieces'} from "${board.title}" to the budget`)
  })
  const plan = toPlanDto((await loadPlan(db, event.id))!, { staff: staffOf(actor) })
  return { plan, added, unpricedItems: seeded.unpricedItems }
}

/** "Reset to Elation defaults": re-seed the way the plan started; the target stays. */
export async function resetBudget(db: Db, actor: Actor, eventId: string) {
  const event = await editableEvent(db, actor, eventId)
  const plan = await requirePlan(db, eventId)
  const from = plan.seededFrom === 'fixture' || plan.seededFrom === 'inspiration' ? 'rules' : plan.seededFrom
  const seeded = await seedLines(db, actor, event, from)
  seeded.lines = fitToTarget(seeded.lines, plan.targetPkr)
  await db.$transaction(async (tx) => {
    await tx.budgetLine.deleteMany({ where: { planId: plan.id } })
    await tx.budgetLine.createMany({ data: lineRows(seeded.lines, 'seed').map((l) => ({ ...l, planId: plan.id })) })
    await bump(tx, plan.id, actor)
    await activity(tx, event, actor, 'Reset the budget to Elation defaults')
  })
  return toPlanDto((await loadPlan(db, eventId))!, { staff: staffOf(actor) })
}

/** Move every snapshot to today's price (pieces no longer priced keep theirs). */
export async function repriceBudget(db: Db, actor: Actor, eventId: string) {
  await editableEvent(db, actor, eventId)
  const plan = await requirePlan(db, eventId)
  const stale = plan.lines.filter((l) => {
    const now = currentPrice(l.inventoryItem)
    return now != null && now !== l.unitPricePkr
  })
  await db.$transaction(async (tx) => {
    // Scoped by plan: a line removed meanwhile by another save is simply skipped.
    for (const l of stale) {
      await tx.budgetLine.updateMany({ where: { id: l.id, planId: plan.id }, data: { unitPricePkr: l.inventoryItem.pricePkr! } })
    }
    if (stale.length) await bump(tx, plan.id, actor)
  })
  return toPlanDto((await loadPlan(db, eventId))!, { staff: staffOf(actor) })
}

// ─────────────── Hand-offs to the consultant ───────────────

/** Tell the consultant: activity entry, a system message in the event's thread, and an email. */
async function notifyConsultant(deps: Deps, event: Event, plan: BudgetPlanDto, kind: 'review' | 'quote', note?: string) {
  const client = await deps.db.user.findUniqueOrThrow({ where: { id: event.clientId }, include: { consultant: true } })
  const thread = await deps.db.thread.findFirst({ where: { clientId: event.clientId, OR: [{ eventId: event.id }, { eventId: null }] }, orderBy: { eventId: { sort: 'asc', nulls: 'last' } } })
  const headline = kind === 'quote' ? 'requested a quote' : 'sent the budget for review'
  const body = `${client.name} ${headline} for ${event.concept ?? event.name}: PKR ${plan.totals.includedPkr.toLocaleString('en-PK')} of PKR ${plan.targetPkr.toLocaleString('en-PK')}.${note ? `\n\n“${note}”` : ''}`
  if (thread) {
    await deps.db.$transaction([
      deps.db.message.create({ data: { threadId: thread.id, kind: 'SYSTEM', body, meta: { type: `budget.${kind}`, eventId: event.id, planId: plan.id } } }),
      deps.db.thread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date() } }),
    ])
  }
  if (client.consultant) {
    // The hand-off is committed; a mail outage must not turn it into an error (the thread + activity still carry it).
    await deps.mailer
      .send(
      budgetForConsultantEmail({
        to: client.consultant.email,
        consultantName: client.consultant.name,
        clientName: client.name,
        eventName: event.concept ?? event.name,
        totalPkr: plan.totals.includedPkr,
        targetPkr: plan.targetPkr,
        note,
        kind,
        url: `${deps.appUrl}/events/${event.id}/budget`,
      }),
    )
      .catch((err: unknown) => deps.log.warn({ err, eventId: event.id }, 'consultant budget email failed'))
  }
  return client.consultant?.name ?? null
}

async function markSubmitted(tx: DbTx, planId: string) {
  await tx.budgetPlan.update({ where: { id: planId }, data: { status: 'SUBMITTED', submittedAt: new Date() } })
}

export async function sendToConsultant(deps: Deps, actor: Actor, eventId: string, note?: string) {
  const event = await editableEvent(deps.db, actor, eventId)
  const plan = await requirePlan(deps.db, eventId)
  await deps.db.$transaction(async (tx) => {
    if (plan.status === 'DRAFT') await markSubmitted(tx, plan.id)
    await activity(tx, event, actor, 'Sent the budget to the consultant', note)
  })
  const dto = toPlanDto((await loadPlan(deps.db, eventId))!, { staff: staffOf(actor) })
  const consultantName = await notifyConsultant(deps, event, dto, 'review', note)
  return { plan: dto, consultantName }
}

/** "Request a quote": freezes the plan in a QuoteRequest for the consultant (admin inbox in Step 12). */
export async function requestQuote(deps: Deps, actor: Actor, eventId: string, note?: string) {
  const event = await editableEvent(deps.db, actor, eventId)
  const plan = await requirePlan(deps.db, eventId)
  if (!plan.lines.some((l) => l.included)) throw new AppError('BUDGET_EMPTY', 422, 'Add at least one piece before requesting a quote')
  const sig = signature(plan.lines)

  // A double click (or a retry) for the same unchanged plan returns the open request.
  const recent = plan.quotes[0]
  if (recent && recent.status === 'OPEN' && (recent.snapshot as { signature?: string }).signature === sig && Date.now() - recent.createdAt.getTime() < QUOTE_DEDUPE_MS) {
    return { quote: toQuoteDto(recent), created: false }
  }

  const dto = toPlanDto(plan, { staff: true })
  const quote = await deps.db.$transaction(async (tx) => {
    const q = await tx.quoteRequest.create({
      data: {
        planId: plan.id,
        note: note || null,
        snapshot: {
          signature: sig,
          targetPkr: plan.targetPkr,
          totalPkr: dto.totals.includedPkr,
          lines: dto.lines.map((l) => ({ inventoryItemId: l.item.id, sku: l.item.sku, name: l.item.name, category: l.category, qty: l.qty, included: l.included, unitPricePkr: l.unitPricePkr })),
        },
      },
    })
    await markSubmitted(tx, plan.id)
    await activity(tx, event, actor, 'Requested a quote from Elation', note, { quoteId: q.id })
    return q
  })
  await notifyConsultant(deps, event, dto, 'quote', note)
  return { quote: toQuoteDto(quote), created: true }
}
