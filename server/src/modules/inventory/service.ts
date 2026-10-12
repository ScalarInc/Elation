import {
  INVENTORY_CSV_COLUMNS,
  inventoryWriteBody,
  type InventoryImportReport,
  type InventoryItemDto,
  type InventoryWriteBody,
  type ListInventoryQuery,
} from '@elation/shared/api'
import {
  EVENT_TYPES,
  INVENTORY_CATEGORIES,
  INVENTORY_UNITS,
  type EventType,
  type InventoryCategory,
  type InventoryUnit,
} from '@elation/shared/domain'
import type { InventoryItem, Prisma, User } from '../../generated/prisma/client'
import { parseCsvRecords, toCsv } from '../../lib/csv'
import {
  eventTypeFromDb,
  eventTypeToDb,
  inventoryCategoryFromDb,
  inventoryCategoryToDb,
  inventoryUnitFromDb,
  inventoryUnitToDb,
} from '../../lib/enums'
import { AppError } from '../../lib/errors'
import type { Db } from '../../plugins/db'

type Actor = Pick<User, 'id' | 'role'>

/** Uploaded/imported images live under /media/inventory until R2 (Step 11). */
export const INVENTORY_IMAGE_BASE = '/media/inventory/'

export function toInventoryDto(item: InventoryItem, opts: { staff: boolean }): InventoryItemDto {
  return {
    id: item.id,
    sku: item.sku,
    name: item.name,
    category: inventoryCategoryFromDb(item.category),
    colour: item.colour,
    colourHex: item.colourHex,
    material: item.material,
    pricePKR: item.pricePkr,
    unit: inventoryUnitFromDb(item.unit),
    image: item.imageUrl,
    tags: item.tags,
    moodTags: item.moodTags,
    styleTags: item.styleTags,
    eventTypes: item.eventTypes.map(eventTypeFromDb),
    active: item.active,
    ...(opts.staff ? { stockQty: item.stockQty, notes: item.notes } : {}),
    updatedAt: item.updatedAt.toISOString(),
  }
}

const isStaff = (actor: Actor) => actor.role !== 'CLIENT'

// ─────────────── Reads ───────────────

export async function listInventory(db: Db, actor: Actor, q: ListInventoryQuery) {
  const staff = isStaff(actor)
  const where: Prisma.InventoryItemWhereInput = {
    ...(staff && q.includeArchived === 'true' ? {} : { active: true }),
    ...(q.category ? { category: inventoryCategoryToDb(q.category) } : {}),
    ...(q.area ? { tags: { has: q.area } } : {}),
    ...(q.priced === 'true' ? { pricePkr: { not: null } } : q.priced === 'false' ? { pricePkr: null } : {}),
    ...(q.q
      ? {
          OR: [
            { name: { contains: q.q, mode: 'insensitive' } },
            { colour: { contains: q.q, mode: 'insensitive' } },
            { sku: { contains: q.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  }
  const items = await db.inventoryItem.findMany({ where, orderBy: [{ category: 'asc' }, { name: 'asc' }] })
  return items.map((i) => toInventoryDto(i, { staff }))
}

export async function getInventoryItem(db: Db, actor: Actor, id: string) {
  const item = await db.inventoryItem.findFirst({
    where: { id, ...(isStaff(actor) ? {} : { active: true }) },
  })
  if (!item) throw new AppError('INVENTORY_NOT_FOUND', 404, 'Item not found')
  return toInventoryDto(item, { staff: isStaff(actor) })
}

/** ETag for the client-facing list: changes whenever any item changes. */
export async function inventoryVersion(db: Db, actor: Actor) {
  const agg = await db.inventoryItem.aggregate({ _max: { updatedAt: true }, _count: true })
  // Staff and clients get different fields, so they must not share a cached copy.
  return `"inv-${isStaff(actor) ? 's' : 'c'}-${agg._count}-${agg._max.updatedAt?.getTime() ?? 0}"`
}

// ─────────────── Writes (staff) ───────────────

function toData(body: InventoryWriteBody) {
  const parsed = inventoryWriteBody.parse(body)
  return {
    sku: parsed.sku,
    name: parsed.name,
    category: inventoryCategoryToDb(parsed.category),
    colour: parsed.colour,
    colourHex: parsed.colourHex ?? null,
    material: parsed.material ?? null,
    pricePkr: parsed.pricePKR ?? null,
    unit: inventoryUnitToDb(parsed.unit),
    stockQty: parsed.stockQty ?? null,
    imageUrl: parsed.image ?? null,
    tags: parsed.tags,
    moodTags: parsed.moodTags ?? [],
    styleTags: parsed.styleTags ?? [],
    eventTypes: (parsed.eventTypes ?? []).map(eventTypeToDb),
    notes: parsed.notes ?? null,
  } satisfies Prisma.InventoryItemCreateInput
}

async function audit(db: Db, actor: Actor, action: string, item: InventoryItem, before?: InventoryItem) {
  await db.auditLog.create({
    data: {
      actorId: actor.id,
      action,
      targetType: 'InventoryItem',
      targetId: item.id,
      before: before ? (JSON.parse(JSON.stringify(before)) as Prisma.InputJsonValue) : undefined,
      after: JSON.parse(JSON.stringify(item)) as Prisma.InputJsonValue,
    },
  })
}

export async function createInventoryItem(db: Db, actor: Actor, body: InventoryWriteBody) {
  const item = await db.inventoryItem.create({ data: toData(body) })
  await audit(db, actor, 'inventory.create', item)
  return toInventoryDto(item, { staff: true })
}

export async function updateInventoryItem(db: Db, actor: Actor, id: string, body: InventoryWriteBody) {
  const before = await db.inventoryItem.findUnique({ where: { id } })
  if (!before) throw new AppError('INVENTORY_NOT_FOUND', 404, 'Item not found')
  const item = await db.inventoryItem.update({ where: { id }, data: toData(body) })
  // Budget lines keep their price snapshot; plans show "prices updated" by comparing (Step 8).
  await audit(db, actor, before.pricePkr !== item.pricePkr ? 'inventory.price-change' : 'inventory.update', item, before)
  return toInventoryDto(item, { staff: true })
}

/** Archive instead of delete: budget lines and moodboard tiles still reference the item. */
export async function setInventoryActive(db: Db, actor: Actor, id: string, active: boolean) {
  const before = await db.inventoryItem.findUnique({ where: { id } })
  if (!before) throw new AppError('INVENTORY_NOT_FOUND', 404, 'Item not found')
  const item = await db.inventoryItem.update({ where: { id }, data: { active } })
  await audit(db, actor, active ? 'inventory.restore' : 'inventory.archive', item, before)
  return toInventoryDto(item, { staff: true })
}

// ─────────────── CSV import / export ───────────────

const splitList = (s: string) =>
  s
    .split(/[;|]/)
    .map((x) => x.trim())
    .filter(Boolean)

const slug = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '-')

function matchLabel<T extends string>(value: string, labels: readonly T[]): T | undefined {
  return labels.find((l) => l.toLowerCase() === value.trim().toLowerCase())
}

/** One spreadsheet row → validated write body, or the problems with it. */
export function rowToWriteBody(record: Record<string, string>): { body?: InventoryWriteBody; errors: string[] } {
  const errors: string[] = []
  const category = matchLabel<InventoryCategory>(record.category ?? '', INVENTORY_CATEGORIES)
  if (!category) errors.push(`Unknown category "${record.category}" — use one of ${INVENTORY_CATEGORIES.join(', ')}`)
  const unit = matchLabel<InventoryUnit>(record.unit || 'each', INVENTORY_UNITS)
  if (!unit) errors.push(`Unknown unit "${record.unit}" — use one of ${INVENTORY_UNITS.join(', ')}`)

  const eventTypes: EventType[] = []
  for (const label of splitList(record.event_types ?? '')) {
    const t = matchLabel<EventType>(label, EVENT_TYPES)
    if (t) eventTypes.push(t)
    else errors.push(`Unknown event type "${label}"`)
  }

  const num = (field: string) => {
    const raw = (record[field] ?? '').replace(/[,\s]/g, '')
    if (raw === '') return null
    const n = Number(raw)
    if (!Number.isInteger(n) || n < 0) {
      errors.push(`${field} must be a whole number`)
      return null
    }
    return n
  }

  const image = record.image_filename
    ? record.image_filename.includes('/')
      ? record.image_filename
      : `${INVENTORY_IMAGE_BASE}${record.image_filename}`
    : null

  if (errors.length) return { errors }

  const candidate: InventoryWriteBody = {
    sku: record.sku,
    name: record.name,
    category: category!,
    colour: record.colour,
    colourHex: record.colour_hex || null,
    material: record.material || null,
    pricePKR: num('price_pkr'),
    unit: unit!,
    stockQty: num('stock_qty'),
    image,
    tags: splitList(record.areas ?? '').map(slug) as InventoryWriteBody['tags'],
    moodTags: splitList(record.moods ?? '').map(slug) as InventoryWriteBody['moodTags'],
    styleTags: splitList(record.styles ?? '').map(slug) as InventoryWriteBody['styleTags'],
    eventTypes,
    notes: record.notes || null,
  }

  const result = inventoryWriteBody.safeParse(candidate)
  if (!result.success) {
    return {
      errors: result.error.issues.map((i) => `${i.path.join('.') || 'row'}: ${i.message}`),
    }
  }
  return { body: candidate, errors: [] }
}

const comparable = (d: unknown) => JSON.stringify(d)

/**
 * Import a spreadsheet (docs/assets/inventory-template.csv). Upserts by SKU.
 * `commit: false` is a dry run that only reports what would happen.
 * Rows not in the file are left alone (archive them explicitly).
 */
export async function importInventoryCsv(
  db: Db,
  actor: Actor | null,
  csv: string,
  opts: { commit: boolean },
): Promise<InventoryImportReport> {
  const report: InventoryImportReport = { committed: false, created: 0, updated: 0, unchanged: 0, errors: [] }
  const rows = parseCsvRecords(csv)
  if (rows.length === 0) throw new AppError('CSV_EMPTY', 400, 'The file has no rows')
  const missing = INVENTORY_CSV_COLUMNS.filter((c) => !(c in rows[0].record))
  if (missing.includes('sku') || missing.includes('name')) {
    throw new AppError('CSV_COLUMNS', 400, `Missing required columns: ${missing.join(', ')}`)
  }

  const seen = new Set<string>()
  const valid: { line: number; data: ReturnType<typeof toData> }[] = []
  for (const { line, record } of rows) {
    const { body, errors } = rowToWriteBody(record)
    if (record.sku && seen.has(record.sku)) errors.push(`Duplicate SKU "${record.sku}" in this file`)
    seen.add(record.sku)
    if (errors.length || !body) report.errors.push({ line, sku: record.sku || null, messages: errors })
    else valid.push({ line, data: toData(body) })
  }

  const existing = await db.inventoryItem.findMany({ where: { sku: { in: valid.map((v) => v.data.sku) } } })
  const bySku = new Map(existing.map((e) => [e.sku, e]))
  const toCreate: typeof valid = []
  const toUpdate: { id: string; data: ReturnType<typeof toData> }[] = []
  for (const v of valid) {
    const current = bySku.get(v.data.sku)
    if (!current) toCreate.push(v)
    else {
      const currentData = {
        sku: current.sku,
        name: current.name,
        category: current.category,
        colour: current.colour,
        colourHex: current.colourHex,
        material: current.material,
        pricePkr: current.pricePkr,
        unit: current.unit,
        stockQty: current.stockQty,
        imageUrl: current.imageUrl,
        tags: current.tags,
        moodTags: current.moodTags,
        styleTags: current.styleTags,
        eventTypes: current.eventTypes,
        notes: current.notes,
      }
      if (comparable(currentData) === comparable(v.data)) report.unchanged++
      else toUpdate.push({ id: current.id, data: v.data })
    }
  }
  report.created = toCreate.length
  report.updated = toUpdate.length

  // All-or-nothing: a file with errors is never half-applied.
  if (opts.commit && report.errors.length === 0) {
    await db.$transaction([
      ...toCreate.map((c) => db.inventoryItem.create({ data: c.data })),
      ...toUpdate.map((u) => db.inventoryItem.update({ where: { id: u.id }, data: u.data })),
      ...(actor
        ? [
            db.auditLog.create({
              data: {
                actorId: actor.id,
                action: 'inventory.import',
                targetType: 'InventoryItem',
                targetId: 'bulk',
                after: { created: report.created, updated: report.updated },
              },
            }),
          ]
        : []),
    ])
    report.committed = true
  }
  return report
}

export async function exportInventoryCsv(db: Db) {
  const items = await db.inventoryItem.findMany({ orderBy: [{ category: 'asc' }, { sku: 'asc' }] })
  return toCsv(
    INVENTORY_CSV_COLUMNS,
    items.map((i) => [
      i.sku,
      i.name,
      inventoryCategoryFromDb(i.category),
      i.colour,
      i.colourHex,
      i.material,
      i.pricePkr,
      inventoryUnitFromDb(i.unit),
      i.stockQty,
      i.tags.join('; '),
      i.moodTags.join('; '),
      i.styleTags.join('; '),
      i.eventTypes.map(eventTypeFromDb).join('; '),
      i.imageUrl?.startsWith(INVENTORY_IMAGE_BASE) ? i.imageUrl.slice(INVENTORY_IMAGE_BASE.length) : i.imageUrl,
      i.notes,
    ]),
  )
}
