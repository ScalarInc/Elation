import { randomUUID } from 'node:crypto'
import type {
  AdoptInspirationBody,
  AdoptInspirationResponse,
  InspirationDetailDto,
  InspirationDto,
  ListInspirationsQuery,
} from '@elation/shared/api'
import { questionById, type Answers } from '@elation/shared/questionnaire'
import type { Prisma, User } from '../../generated/prisma/client'
import { eventTypeFromDb, eventTypeToDb } from '../../lib/enums'
import { AppError } from '../../lib/errors'
import { assertEventAccess } from '../../lib/policy'
import { postSystemMessage } from '../../lib/threads'
import type { Db } from '../../plugins/db'
import { toInventoryDto } from '../inventory/service'
import { getDefaults, lockEvent } from '../moodboards/service'
import { patchQuestionnaire } from '../questionnaire/service'

type Actor = Pick<User, 'id' | 'role'>

/** Guest count the gallery's "from PKR …" figure assumes. */
const INDICATIVE_GUESTS = 200

const detailInclude = {
  tiles: { orderBy: { position: 'asc' } },
  items: { include: { inventoryItem: true }, orderBy: { id: 'asc' } },
} satisfies Prisma.InspirationInclude
type DetailRow = Prisma.InspirationGetPayload<{ include: typeof detailInclude }>
type ListRow = Prisma.InspirationGetPayload<{ include: { tiles: true } }>

const staffOf = (actor: Actor) => actor.role !== 'CLIENT'

function toDto(i: ListRow): InspirationDto {
  return {
    id: i.id,
    slug: i.slug,
    name: i.name,
    eventTypes: i.eventTypes.map(eventTypeFromDb),
    style: i.style,
    palette: i.palette,
    cover: i.coverUrl,
    tiles: [...i.tiles].sort((a, b) => a.position - b.position).map((t) => t.imageUrl),
    summary: i.summary,
    featured: i.featured,
    budgetTier: (i.budgetTier as InspirationDto['budgetTier']) ?? null,
  }
}

/** Quantity of one inspiration piece for a guest count (fixed, or per 100 guests rounded up). */
export function inspirationQty(rule: { qtyFixed: number | null; qtyPer100Guests: number | null }, guests: number) {
  if (rule.qtyFixed != null) return Math.max(1, rule.qtyFixed)
  return Math.max(1, Math.ceil(((rule.qtyPer100Guests ?? 1) * Math.max(1, guests)) / 100))
}

// ─────────────── Reads ───────────────

/** Published concepts only; the filters mirror the gallery's filter bar. */
export async function listInspirations(db: Db, query: ListInspirationsQuery) {
  const where: Prisma.InspirationWhereInput = {
    published: true,
    ...(query.eventType && { eventTypes: { has: eventTypeToDb(query.eventType) } }),
    ...(query.tier && { budgetTier: query.tier }),
    ...(query.palette && { palette: { has: query.palette.toUpperCase() } }),
    ...(query.style && { style: { contains: query.style, mode: 'insensitive' } }),
    ...(query.q && {
      OR: [
        { name: { contains: query.q, mode: 'insensitive' } },
        { summary: { contains: query.q, mode: 'insensitive' } },
        { style: { contains: query.q, mode: 'insensitive' } },
      ],
    }),
  }
  const rows = await db.inspiration.findMany({ where, include: { tiles: true }, orderBy: [{ featured: 'desc' }, { name: 'asc' }] })
  return rows.map(toDto)
}

async function loadPublished(db: Db, slug: string): Promise<DetailRow> {
  const row = await db.inspiration.findFirst({ where: { slug, published: true }, include: detailInclude })
  if (!row) throw new AppError('INSPIRATION_NOT_FOUND', 404, 'Concept not found')
  return row
}

export async function getInspiration(db: Db, actor: Actor, slug: string): Promise<InspirationDetailDto> {
  const row = await loadPublished(db, slug)
  const items = row.items.filter((i) => i.inventoryItem.active)
  return {
    ...toDto(row),
    items: items.map((i) => ({
      item: toInventoryDto(i.inventoryItem, { staff: staffOf(actor) }),
      category: i.category,
      qtyPer100Guests: i.qtyPer100Guests,
      qtyFixed: i.qtyFixed,
    })),
    indicativeTotalPkr: items.reduce(
      (sum, i) => sum + (i.inventoryItem.pricePkr ?? 0) * inspirationQty(i, INDICATIVE_GUESTS),
      0,
    ),
  }
}

// ─────────────── Adopt ───────────────

/** Concept style words → Q10 aesthetic options. */
function aestheticFrom(style: string): string[] {
  const options = (questionById.get('q10_aesthetic')?.options ?? []) as readonly string[]
  const alias: Record<string, string> = { minimal: 'Minimalistic', garden: 'Organic', warm: 'Traditional', serene: 'Soft' }
  const picked = new Set<string>()
  for (const word of style.split(/[·\s-]+/).map((w) => w.trim().toLowerCase()).filter(Boolean)) {
    const option = options.find((o) => o.toLowerCase() === word) ?? alias[word]
    if (option) picked.add(option)
  }
  return [...picked]
}

const isEmpty = (v: unknown) => v == null || v === '' || (Array.isArray(v) && v.length === 0)

/**
 * "Adopt this concept": a primary moodboard from the concept, its pieces in the
 * event's budget (replace or merge), and empty style answers pre-filled.
 */
export async function adoptInspiration(
  db: Db,
  actor: Actor,
  slug: string,
  body: AdoptInspirationBody,
): Promise<AdoptInspirationResponse> {
  const inspiration = await loadPublished(db, slug)
  const event = await assertEventAccess(db, actor, body.eventId)
  if (event.status === 'ARCHIVED') throw new AppError('EVENT_ARCHIVED', 422, 'Unarchive this event first')

  const guests = event.guests ?? 100
  const pieces = inspiration.items.filter((i) => i.inventoryItem.active)
  const priced = pieces.filter((i) => i.inventoryItem.pricePkr != null)
  const unpricedItems = pieces.filter((i) => i.inventoryItem.pricePkr == null).map((i) => ({ id: i.inventoryItem.id, name: i.inventoryItem.name }))
  const { controls } = await getDefaults(db, actor, event.id)

  const { moodboardId, budgetPlanId } = await db.$transaction(async (tx) => {
    // 1) The concept becomes the event's lead moodboard.
    await lockEvent(tx, event.id)
    await tx.moodboard.updateMany({ where: { eventId: event.id, isPrimary: true }, data: { isPrimary: false } })
    const tiles = [
      ...inspiration.tiles.map((t) => ({ kind: 'INSPIRATION' as const, imageUrl: t.imageUrl, area: null, inventoryItemId: null })),
      ...pieces.map((p) => ({ kind: 'INVENTORY' as const, imageUrl: p.inventoryItem.imageUrl, area: p.inventoryItem.tags[0] ?? null, inventoryItemId: p.inventoryItem.id })),
    ]
    const board = await tx.moodboard.create({
      data: {
        eventId: event.id,
        generationId: randomUUID(),
        variantLabel: 'A',
        title: inspiration.name,
        status: 'SAVED',
        isPrimary: true,
        palette: inspiration.palette,
        controls: { ...controls, palette: inspiration.palette.length ? inspiration.palette : controls.palette },
        generator: 'inspiration',
        narrative: inspiration.summary,
        sourceInspirationId: inspiration.id,
        createdById: actor.id,
        tiles: {
          create: tiles.map((t, position) => ({ ...t, position, reasons: [`from ${inspiration.name}`] })),
        },
      },
    })

    // 2) Its priced pieces in the budget.
    const lines = priced.map((p) => ({
      inventoryItemId: p.inventoryItem.id,
      category: p.category,
      qty: inspirationQty(p, guests),
      unitPricePkr: p.inventoryItem.pricePkr!,
      included: true,
      source: 'inspiration',
    }))
    const existing = await tx.budgetPlan.findUnique({ where: { eventId: event.id }, include: { lines: true } })
    let planId: string
    if (!existing) {
      const targetPkr = event.budgetPkr ?? lines.reduce((s, l) => s + l.qty * l.unitPricePkr, 0)
      const plan = await tx.budgetPlan.create({
        data: { eventId: event.id, targetPkr, seededFrom: 'inspiration', updatedById: actor.id, lines: { create: lines.map((l, position) => ({ ...l, position })) } },
      })
      // Never turn "no budget yet" into an explicit PKR 0.
      if (targetPkr > 0) await tx.event.update({ where: { id: event.id }, data: { budgetPkr: targetPkr } })
      planId = plan.id
    } else {
      const keep = body.mode === 'replace' ? [] : existing.lines
      if (body.mode === 'replace') await tx.budgetLine.deleteMany({ where: { planId: existing.id } })
      const have = new Set(keep.map((l) => l.inventoryItemId))
      const fresh = lines.filter((l) => !have.has(l.inventoryItemId))
      await tx.budgetLine.createMany({ data: fresh.map((l, i) => ({ ...l, planId: existing.id, position: keep.length + i })) })
      await tx.budgetPlan.update({ where: { id: existing.id }, data: { version: { increment: 1 }, updatedById: actor.id } })
      planId = existing.id
    }

    // 3) Tell the consultant.
    await tx.activityEntry.create({
      data: {
        clientId: event.clientId,
        eventId: event.id,
        actorId: actor.id,
        kind: 'MOODBOARD',
        title: `Adopted ${inspiration.name}`,
        detail: existing ? (body.mode === 'replace' ? 'Budget replaced with the concept’s pieces' : 'Concept pieces added to the budget') : 'Moodboard and budget started from the concept',
        meta: { inspirationId: inspiration.id, moodboardId: board.id },
      },
    })
    await postSystemMessage(tx, {
      clientId: event.clientId,
      eventId: event.id,
      body: `Adopted the ${inspiration.name} concept for ${event.concept ?? event.name}.`,
      meta: { type: 'inspiration.adopted', eventId: event.id, inspirationId: inspiration.id, moodboardId: board.id },
    })
    return { moodboardId: board.id, budgetPlanId: planId }
  })

  // 4) Pre-fill style answers the client hasn't given (never overwrites).
  const prefilled = await prefillStyleAnswers(db, actor, event.id, inspiration)
  return { moodboardId, budgetPlanId, unpricedItems, prefilled }
}

async function prefillStyleAnswers(db: Db, actor: Actor, eventId: string, inspiration: { name: string; style: string; palette: string[] }) {
  const response = await db.questionnaireResponse.findUnique({ where: { eventId } })
  const answers = (response?.answers ?? {}) as Answers
  // "Elation decides" is an answer too — never replace it.
  const decides = (response?.elationDecides ?? {}) as Record<string, boolean>
  const open = (qid: string) => isEmpty(answers[qid]) && !decides[qid]
  const set: Answers = {}
  const aesthetic = aestheticFrom(inspiration.style)
  if (open('q10_aesthetic') && aesthetic.length) set.q10_aesthetic = aesthetic
  if (open('q16_colours') && inspiration.palette.length) set.q16_colours = { desc: `${inspiration.name} palette`, hex: inspiration.palette }
  if (!Object.keys(set).length) return []
  try {
    await patchQuestionnaire(db, actor, eventId, { version: response?.version ?? 0, set })
    return Object.keys(set)
  } catch {
    // The adoption has committed; a pre-fill that loses a race (or fails) is skipped, not an error —
    // otherwise a retry would adopt the concept twice.
    return []
  }
}
