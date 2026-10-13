import { randomUUID } from 'node:crypto'
import type {
  GenerateMoodboardBody,
  MoodboardControls,
  MoodboardDefaults,
  MoodboardDto,
  TileAlternative,
} from '@elation/shared/api'
import { moodboardControlsSchema } from '@elation/shared/api'
import { deriveMoodboardDefaults } from '@elation/shared/moodboard'
import { visibleAnswers, type Answers } from '@elation/shared/questionnaire'
import type { Event, InventoryItem, Prisma, User } from '../../generated/prisma/client'
import { eventTypeFromDb, inventoryCategoryFromDb } from '../../lib/enums'
import { AppError } from '../../lib/errors'
import { assertEventAccess, eventScope } from '../../lib/policy'
import { postSystemMessage } from '../../lib/threads'
import type { Db, DbTx } from '../../plugins/db'
import { toInventoryDto } from '../inventory/service'
import { alternativesFor, excludedBy, generateConcepts, type EngineInput, type EngineItem } from './engine/engine'

type Actor = Pick<User, 'id' | 'role'>

const GENERATOR = 'rules-v1'

const moodboardInclude = {
  tiles: { orderBy: { position: 'asc' }, include: { inventoryItem: true } },
  event: { select: { type: true } },
} satisfies Prisma.MoodboardInclude
type MoodboardRow = Prisma.MoodboardGetPayload<{ include: typeof moodboardInclude }>

export function toMoodboardDto(m: MoodboardRow, opts: { staff: boolean }): MoodboardDto {
  const controls = moodboardControlsSchema.safeParse(m.controls)
  const tileItems = m.tiles.map((t) => ({
    id: t.id,
    position: t.position,
    kind: t.kind.toLowerCase() as 'inventory' | 'reference' | 'inspiration',
    area: t.area,
    imageUrl: t.imageUrl ?? t.inventoryItem?.imageUrl ?? null,
    item: t.inventoryItem ? toInventoryDto(t.inventoryItem, opts) : null,
    // The score folds in stock levels, which clients don't see.
    score: opts.staff ? t.score : null,
    reasons: t.reasons,
    locked: t.locked,
  }))
  const images = tileItems.map((t) => t.imageUrl).filter((u): u is string => Boolean(u))
  const cover = tileItems.find((t) => t.id === m.coverTileId)?.imageUrl ?? images[0] ?? null
  return {
    id: m.id,
    eventId: m.eventId,
    title: m.title,
    tag: eventTypeFromDb(m.event.type),
    cover,
    tiles: images,
    palette: m.palette,
    createdAt: m.createdAt.toISOString(),
    liked: m.liked,
    status: m.status.toLowerCase() as MoodboardDto['status'],
    variantLabel: m.variantLabel,
    generationId: m.generationId,
    isPrimary: m.isPrimary,
    controls: controls.success ? controls.data : null,
    narrative: m.narrative,
    generator: m.generator,
    tileItems,
  }
}

const staffOf = (actor: Actor) => actor.role !== 'CLIENT'

function toEngineItem(i: InventoryItem): EngineItem {
  return {
    id: i.id,
    name: i.name,
    category: inventoryCategoryFromDb(i.category),
    colour: i.colour,
    colourHex: i.colourHex,
    material: i.material,
    pricePkr: i.pricePkr,
    imageUrl: i.imageUrl,
    stockQty: i.stockQty,
    tags: i.tags,
    moodTags: i.moodTags,
    styleTags: i.styleTags,
    eventTypes: i.eventTypes.map(eventTypeFromDb),
    placeholder: i.notes === 'placeholder',
  }
}

/** Q132: how many concepts the client asked for. */
export function variantCount(answers: Answers): 1 | 3 {
  return answers.q132_deliverables === 'One Mood Board' ? 1 : 3
}

async function engineInputFor(db: Db, event: Event, controls: MoodboardControls, seed: string): Promise<EngineInput> {
  const [questionnaire, inventory] = await Promise.all([
    db.questionnaireResponse.findUnique({ where: { eventId: event.id } }),
    db.inventoryItem.findMany({ where: { active: true } }),
  ])
  const answers = (questionnaire?.answers ?? {}) as Answers
  return {
    event: { type: eventTypeFromDb(event.type), guests: event.guests, budgetPkr: event.budgetPkr, concept: event.concept },
    answers,
    controls,
    inventory: inventory.map(toEngineItem),
    variants: variantCount(answers),
    seed,
  }
}

async function assertMoodboardAccess(db: Db, actor: Actor, moodboardId: string) {
  const m = /^[0-9a-f-]{36}$/i.test(moodboardId)
    ? await db.moodboard.findFirst({ where: { id: moodboardId, event: eventScope(actor) } })
    : null
  if (!m) throw new AppError('MOODBOARD_NOT_FOUND', 404, 'Moodboard not found')
  return m
}

async function load(db: Db, id: string) {
  return db.moodboard.findUniqueOrThrow({ where: { id }, include: moodboardInclude })
}

// ─────────────── Reads ───────────────

export async function getDefaults(db: Db, actor: Actor, eventId: string): Promise<MoodboardDefaults> {
  await assertEventAccess(db, actor, eventId)
  const q = await db.questionnaireResponse.findUnique({ where: { eventId } })
  return deriveMoodboardDefaults((q?.answers ?? {}) as Answers)
}

/** Library: concepts across all events the actor can see. */
export async function listMoodboards(
  db: Db,
  actor: Actor,
  query: { eventId?: string; status: 'saved' | 'draft' | 'all'; liked?: 'true' | 'false'; limit: number },
) {
  const rows = await db.moodboard.findMany({
    where: {
      event: eventScope(actor),
      ...(query.eventId ? { eventId: query.eventId } : {}),
      status: query.status === 'saved' ? 'SAVED' : query.status === 'draft' ? 'DRAFT' : { not: 'ARCHIVED' },
      ...(query.liked ? { liked: query.liked === 'true' } : {}),
    },
    include: moodboardInclude,
    orderBy: { createdAt: 'desc' },
    take: query.limit,
  })
  return rows.map((m) => toMoodboardDto(m, { staff: staffOf(actor) }))
}

/** One event's concepts: a given generation (default: the latest) plus everything saved. */
export async function listEventMoodboards(db: Db, actor: Actor, eventId: string, generationId?: string) {
  await assertEventAccess(db, actor, eventId)
  const latest = generationId
    ? { generationId }
    : await db.moodboard.findFirst({ where: { eventId, status: { not: 'ARCHIVED' } }, orderBy: { createdAt: 'desc' }, select: { generationId: true } })
  const rows = await db.moodboard.findMany({
    where: {
      eventId,
      status: { not: 'ARCHIVED' },
      OR: [{ status: 'SAVED' }, ...(latest ? [{ generationId: latest.generationId }] : [])],
    },
    include: moodboardInclude,
  })
  // Newest generation first; A → B → C within a generation.
  const startedAt = new Map<string, number>()
  for (const r of rows) {
    const t = r.createdAt.getTime()
    startedAt.set(r.generationId, Math.min(startedAt.get(r.generationId) ?? t, t))
  }
  rows.sort(
    (a, b) =>
      startedAt.get(b.generationId)! - startedAt.get(a.generationId)! ||
      a.generationId.localeCompare(b.generationId) ||
      a.variantLabel.localeCompare(b.variantLabel),
  )
  return rows.map((m) => toMoodboardDto(m, { staff: staffOf(actor) }))
}

export async function getMoodboard(db: Db, actor: Actor, id: string) {
  await assertMoodboardAccess(db, actor, id)
  return toMoodboardDto(await load(db, id), { staff: staffOf(actor) })
}

// ─────────────── Generate ───────────────

export async function generateForEvent(
  db: Db,
  actor: Actor,
  eventId: string,
  body: GenerateMoodboardBody,
  opts: { seed?: string; reason?: 'regenerate' | 'questionnaire-submitted' } = {},
) {
  const event = await assertEventAccess(db, actor, eventId)
  if (event.status === 'ARCHIVED') throw new AppError('EVENT_ARCHIVED', 422, 'Unarchive this event first')

  const controls = body.controls ?? (await getDefaults(db, actor, eventId)).controls
  const generationId = randomUUID()
  const input = await engineInputFor(db, event, controls, opts.seed ?? generationId)

  if (body.keepLockedFrom) {
    const source = await assertMoodboardAccess(db, actor, body.keepLockedFrom)
    if (source.eventId !== eventId) throw new AppError('MOODBOARD_NOT_FOUND', 404, 'Moodboard not found')
    const tiles = await db.moodboardTile.findMany({ where: { moodboardId: source.id, locked: true } })
    input.lockedTiles = tiles.map((t) => ({ position: t.position, area: t.area, itemId: t.inventoryItemId, imageUrl: t.imageUrl }))
  }

  const concepts = generateConcepts(input)
  const empty = concepts.filter((c) => c.tiles.length === 0)
  if (empty.length === concepts.length) {
    throw new AppError('NO_INVENTORY_MATCH', 422, 'Elation has nothing in inventory that fits these choices yet')
  }

  const ids = await db.$transaction(async (tx) => {
    // Locked so two first generations can't both announce themselves.
    await lockEvent(tx, eventId)
    const isFirst = (await tx.moodboard.count({ where: { eventId } })) === 0
    // Earlier generations' unsaved drafts are superseded; saved concepts stay.
    await tx.moodboard.updateMany({ where: { eventId, status: 'DRAFT', isPrimary: false }, data: { status: 'ARCHIVED' } })
    const created: string[] = []
    for (const c of concepts) {
      const m = await tx.moodboard.create({
        data: {
          eventId,
          generationId,
          variantLabel: c.variantLabel,
          title: c.title,
          palette: c.palette,
          controls,
          generator: GENERATOR,
          createdById: actor.id,
          tiles: {
            create: c.tiles.map((t) => ({
              position: t.position,
              kind: 'INVENTORY' as const,
              inventoryItemId: t.itemId,
              imageUrl: t.imageUrl,
              area: t.area,
              score: t.score,
              reasons: t.reasons,
              locked: t.locked,
            })),
          },
        },
      })
      created.push(m.id)
    }
    await tx.activityEntry.create({
      data: {
        clientId: event.clientId,
        eventId,
        actorId: actor.id,
        kind: 'MOODBOARD',
        title:
          opts.reason === 'questionnaire-submitted'
            ? `Elation curated your first ${concepts.length === 1 ? 'concept' : `${concepts.length} concepts`}`
            : `Elation curated ${concepts.length === 1 ? 'a new concept' : `${concepts.length} new concepts`}`,
        detail: concepts.map((c) => c.title).join(' · '),
        meta: { generationId },
      },
    })
    // The chat hears about the first curation only, not every regenerate.
    if (isFirst || opts.reason === 'questionnaire-submitted') {
      const n = concepts.length === 1 ? 'a new concept' : `${concepts.length} new concepts`
      await postSystemMessage(tx, {
        clientId: event.clientId,
        eventId,
        body: `Elation curated ${n} for ${event.concept ?? event.name}.`,
        meta: { type: 'moodboard.generated', eventId, generationId },
      })
    }
    return created
  })

  const rows = await db.moodboard.findMany({ where: { id: { in: ids } }, include: moodboardInclude, orderBy: { variantLabel: 'asc' } })
  return { generationId, concepts: rows.map((m) => toMoodboardDto(m, { staff: staffOf(actor) })) }
}

/**
 * One rules-engine concept from priced pieces only, not persisted — the budget's
 * "Elation's recommendation" seed (docs/step-08-budget.md).
 */
export async function recommendedPieces(db: Db, actor: Actor, event: Event) {
  const { controls } = await getDefaults(db, actor, event.id)
  const input = await engineInputFor(db, event, controls, `budget:${event.id}`)
  const [concept] = generateConcepts({ ...input, inventory: input.inventory.filter((i) => i.pricePkr != null), variants: 1 })
  const picks = (concept?.tiles ?? []).flatMap((t) => (t.itemId ? [{ itemId: t.itemId, area: t.area }] : []))
  return { answers: input.answers, picks }
}

/** The concept a budget follows: the lead, else the newest saved, else the newest draft. */
export async function leadMoodboard(db: Db, eventId: string) {
  return db.moodboard.findFirst({
    where: { eventId, status: { not: 'ARCHIVED' } },
    orderBy: [{ isPrimary: 'desc' }, { status: 'desc' }, { createdAt: 'desc' }],
    include: { tiles: { orderBy: { position: 'asc' } } },
  })
}

/** After the questionnaire is submitted: first concepts, unless the event already has some. */
export async function generateFirstConcepts(db: Db, actor: Actor, eventId: string) {
  const existing = await db.moodboard.count({ where: { eventId, status: { not: 'ARCHIVED' } } })
  if (existing > 0) return null
  return generateForEvent(db, actor, eventId, {}, { reason: 'questionnaire-submitted' })
}

// ─────────────── Concept actions ───────────────

export async function updateMoodboard(db: Db, actor: Actor, id: string, body: { title?: string; liked?: boolean }) {
  await assertMoodboardAccess(db, actor, id)
  await db.moodboard.update({ where: { id }, data: body })
  return getMoodboard(db, actor, id)
}

/** Serialises primary changes per event (the partial unique index allows only one). */
export async function lockEvent(tx: DbTx, eventId: string) {
  await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId}::uuid FOR UPDATE`
}

async function makePrimary(tx: DbTx, eventId: string, id: string) {
  await lockEvent(tx, eventId)
  await tx.moodboard.updateMany({ where: { eventId, isPrimary: true, id: { not: id } }, data: { isPrimary: false } })
  await tx.moodboard.update({ where: { id }, data: { isPrimary: true, status: 'SAVED' } })
}

/** "Save as concept". The first saved concept of an event also becomes its primary. */
export async function saveMoodboard(db: Db, actor: Actor, id: string) {
  const m = await assertMoodboardAccess(db, actor, id)
  if (m.status === 'ARCHIVED') throw new AppError('MOODBOARD_ARCHIVED', 422, 'This concept was removed')
  await db.$transaction(async (tx) => {
    await lockEvent(tx, m.eventId)
    const hasPrimary = await tx.moodboard.count({ where: { eventId: m.eventId, isPrimary: true, status: { not: 'ARCHIVED' } } })
    if (hasPrimary === 0) await makePrimary(tx, m.eventId, id)
    else await tx.moodboard.update({ where: { id }, data: { status: 'SAVED' } })
    const event = await tx.event.findUniqueOrThrow({ where: { id: m.eventId } })
    await tx.activityEntry.create({
      data: { clientId: event.clientId, eventId: m.eventId, actorId: actor.id, kind: 'MOODBOARD', title: `Saved concept "${m.title}"` },
    })
  })
  return getMoodboard(db, actor, id)
}

export async function setPrimary(db: Db, actor: Actor, id: string) {
  const m = await assertMoodboardAccess(db, actor, id)
  if (m.status === 'ARCHIVED') throw new AppError('MOODBOARD_ARCHIVED', 422, 'Restore this concept first')
  await db.$transaction(async (tx) => {
    await makePrimary(tx, m.eventId, id)
    const event = await tx.event.findUniqueOrThrow({ where: { id: m.eventId } })
    await tx.activityEntry.create({
      data: { clientId: event.clientId, eventId: m.eventId, actorId: actor.id, kind: 'MOODBOARD', title: `"${m.title}" is now the lead concept` },
    })
  })
  return getMoodboard(db, actor, id)
}

export async function duplicateMoodboard(db: Db, actor: Actor, id: string) {
  await assertMoodboardAccess(db, actor, id)
  const source = await load(db, id)
  const copy = await db.moodboard.create({
    data: {
      eventId: source.eventId,
      generationId: randomUUID(),
      variantLabel: source.variantLabel,
      title: `${source.title} · Copy`,
      status: 'SAVED',
      palette: source.palette,
      controls: source.controls ?? {},
      generator: source.generator,
      narrative: source.narrative,
      sourceInspirationId: source.sourceInspirationId,
      createdById: actor.id,
      tiles: {
        create: source.tiles.map((t) => ({
          position: t.position,
          kind: t.kind,
          inventoryItemId: t.inventoryItemId,
          fileId: t.fileId,
          imageUrl: t.imageUrl,
          area: t.area,
          score: t.score,
          reasons: t.reasons,
          locked: t.locked,
        })),
      },
    },
  })
  return getMoodboard(db, actor, copy.id)
}

/** "Remove" in the library — archived, never hard-deleted. Removing the lead concept hands the lead to the newest saved one. */
export async function archiveMoodboard(db: Db, actor: Actor, id: string) {
  const m = await assertMoodboardAccess(db, actor, id)
  await db.$transaction(async (tx) => {
    await lockEvent(tx, m.eventId)
    await tx.moodboard.update({ where: { id }, data: { status: 'ARCHIVED', isPrimary: false } })
    if (!m.isPrimary) return
    const next = await tx.moodboard.findFirst({ where: { eventId: m.eventId, status: 'SAVED' }, orderBy: { createdAt: 'desc' } })
    if (next) await tx.moodboard.update({ where: { id: next.id }, data: { isPrimary: true } })
  })
}

// ─────────────── Tiles ───────────────

export async function reorderTiles(db: Db, actor: Actor, id: string, tileIds: string[]) {
  await assertMoodboardAccess(db, actor, id)
  const tiles = await db.moodboardTile.findMany({ where: { moodboardId: id }, select: { id: true } })
  const current = new Set(tiles.map((t) => t.id))
  if (tileIds.length !== current.size || !tileIds.every((t) => current.has(t)) || new Set(tileIds).size !== tileIds.length) {
    throw new AppError('INVALID_ORDER', 400, 'Send every tile of this concept exactly once')
  }
  await db.$transaction(tileIds.map((tileId, position) => db.moodboardTile.update({ where: { id: tileId }, data: { position } })))
  return getMoodboard(db, actor, id)
}

async function findTile(db: Db, moodboardId: string, tileId: string) {
  const tile = await db.moodboardTile.findFirst({ where: { id: tileId, moodboardId } })
  if (!tile) throw new AppError('TILE_NOT_FOUND', 404, 'Tile not found')
  return tile
}

/** Lock a tile, or swap the piece it shows. */
export async function updateTile(db: Db, actor: Actor, id: string, tileId: string, body: { locked?: boolean; inventoryItemId?: string }) {
  const board = await assertMoodboardAccess(db, actor, id)
  const tile = await db.moodboardTile.findFirst({ where: { id: tileId, moodboardId: id }, include: { inventoryItem: true } })
  if (!tile) throw new AppError('TILE_NOT_FOUND', 404, 'Tile not found')
  let swap: Prisma.MoodboardTileUpdateInput = {}
  if (body.inventoryItemId) {
    const item = await db.inventoryItem.findFirst({ where: { id: body.inventoryItemId, active: true } })
    if (!item) throw new AppError('INVENTORY_NOT_FOUND', 404, 'That piece is no longer available')
    // Same rules as the alternatives list: like for like, and never against the brief.
    if (tile.inventoryItem && tile.inventoryItem.category !== item.category) {
      throw new AppError('SWAP_NOT_ALLOWED', 422, 'Swap for a piece of the same kind')
    }
    const [event, questionnaire] = await Promise.all([
      db.event.findUniqueOrThrow({ where: { id: board.eventId } }),
      db.questionnaireResponse.findUnique({ where: { eventId: board.eventId } }),
    ])
    const why = excludedBy(toEngineItem(item), visibleAnswers((questionnaire?.answers ?? {}) as Answers), eventTypeFromDb(event.type))
    if (why) throw new AppError('SWAP_NOT_ALLOWED', 422, `That piece doesn't fit your brief (${why})`)
    swap = { inventoryItem: { connect: { id: item.id } }, imageUrl: item.imageUrl, kind: 'INVENTORY', score: null, reasons: ['your choice'] }
  }
  await db.moodboardTile.update({ where: { id: tileId }, data: { ...swap, ...(body.locked !== undefined && { locked: body.locked }) } })
  return getMoodboard(db, actor, id)
}

export async function tileAlternatives(db: Db, actor: Actor, id: string, tileId: string): Promise<TileAlternative[]> {
  await assertMoodboardAccess(db, actor, id)
  const board = await db.moodboard.findUniqueOrThrow({ where: { id }, include: { event: true } })
  const tile = await findTile(db, id, tileId)
  const controls = moodboardControlsSchema.safeParse(board.controls)
  const input = await engineInputFor(
    db,
    board.event,
    controls.success ? controls.data : (await getDefaults(db, actor, board.eventId)).controls,
    board.generationId,
  )
  const alts = alternativesFor(input, { area: tile.area ?? 'stage', itemId: tile.inventoryItemId })
  const items = await db.inventoryItem.findMany({ where: { id: { in: alts.map((a) => a.item.id) } } })
  const byId = new Map(items.map((i) => [i.id, i]))
  const staff = staffOf(actor)
  return alts.map((a) => ({ item: toInventoryDto(byId.get(a.item.id)!, { staff }), score: staff ? a.score : null, reasons: a.reasons }))
}

/** "Ask my consultant" for an alternative — lands in the event's chat thread and the activity feed. */
export async function consultOnTile(db: Db, actor: Actor, id: string, tileId: string, note?: string) {
  const board = await assertMoodboardAccess(db, actor, id)
  const tile = await db.moodboardTile.findFirst({ where: { id: tileId, moodboardId: id }, include: { inventoryItem: true } })
  if (!tile) throw new AppError('TILE_NOT_FOUND', 404, 'Tile not found')
  const event = await db.event.findUniqueOrThrow({ where: { id: board.eventId } })
  const piece = tile.inventoryItem?.name ?? 'this piece'
  await db.activityEntry.create({
    data: {
      clientId: event.clientId,
      eventId: event.id,
      actorId: actor.id,
      kind: 'MOODBOARD',
      title: `Asked Elation for an alternative to ${piece}`,
      detail: note || undefined,
      meta: { moodboardId: id, tileId, request: 'swap' },
    },
  })
  const who = await db.user.findUniqueOrThrow({ where: { id: actor.id }, select: { name: true } })
  await postSystemMessage(db, {
    clientId: event.clientId,
    eventId: event.id,
    body: `${who.name.split(' ')[0]} asked for an alternative to ${piece}.${note ? ` “${note}”` : ''}`,
    meta: { type: 'moodboard.consult', eventId: event.id, moodboardId: id, tileId },
  })
}
