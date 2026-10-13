import type { AdminArSetDto, AdminInspirationDto, InspirationWriteBody } from '@elation/shared/api'
import { arSetWriteBody, arStatusBody, arAssetWriteBody, inspirationWriteBody } from '@elation/shared/api'
import type { z } from 'zod'
import type { ARSetStatus, Prisma, User } from '../../generated/prisma/client'
import { eventTypeFromDb, eventTypeToDb } from '../../lib/enums'
import { AppError } from '../../lib/errors'
import type { Mailer } from '../../lib/mailer'
import { assertEventAccess, eventScope } from '../../lib/policy'
import type { Db } from '../../plugins/db'
import { notifySetReady } from '../ar/service'
import { audit } from './audit'

type Actor = Pick<User, 'id' | 'role'>
type Meta = { ip?: string }
const UUID = /^[0-9a-f-]{36}$/i

/** CMS for the inspiration gallery and AR sets (docs/step-12-admin.md). */

// ─────────────── Inspirations ───────────────

const inspirationInclude = {
  tiles: { orderBy: { position: 'asc' } },
  items: { include: { inventoryItem: { select: { name: true, sku: true } } } },
} satisfies Prisma.InspirationInclude

type InspirationRow = Prisma.InspirationGetPayload<{ include: typeof inspirationInclude }>

async function toInspirationDto(db: Db, i: InspirationRow): Promise<AdminInspirationDto> {
  const adoptions = await db.moodboard.count({ where: { sourceInspirationId: i.id } })
  return {
    id: i.id,
    slug: i.slug,
    name: i.name,
    eventTypes: i.eventTypes.map(eventTypeFromDb),
    style: i.style,
    palette: i.palette,
    coverUrl: i.coverUrl,
    summary: i.summary,
    featured: i.featured,
    budgetTier: (i.budgetTier as AdminInspirationDto['budgetTier']) ?? null,
    published: i.published,
    tiles: i.tiles.map((t) => ({ id: t.id, imageUrl: t.imageUrl, caption: t.caption })),
    items: i.items.map((it) => ({
      id: it.id,
      inventoryItemId: it.inventoryItemId,
      name: it.inventoryItem.name,
      sku: it.inventoryItem.sku,
      category: it.category,
      qtyPer100Guests: it.qtyPer100Guests,
      qtyFixed: it.qtyFixed,
    })),
    adoptions,
    updatedAt: i.updatedAt.toISOString(),
  }
}

export async function listAdminInspirations(db: Db) {
  const rows = await db.inspiration.findMany({ include: inspirationInclude, orderBy: [{ published: 'desc' }, { name: 'asc' }] })
  return Promise.all(rows.map((r) => toInspirationDto(db, r)))
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'concept'

async function loadInspiration(db: Db, id: string) {
  const i = UUID.test(id) ? await db.inspiration.findUnique({ where: { id }, include: inspirationInclude }) : null
  if (!i) throw new AppError('INSPIRATION_NOT_FOUND', 404, 'Concept not found')
  return i
}

async function writeInspiration(db: Db, actor: Actor, id: string | null, input: z.output<typeof inspirationWriteBody>, meta: Meta) {
  if (input.items.some((it) => !it.qtyFixed && !it.qtyPer100Guests)) {
    throw new AppError('QTY_REQUIRED', 422, 'Give each piece a fixed quantity or a quantity per 100 guests')
  }
  const found = await db.inventoryItem.count({ where: { id: { in: [...new Set(input.items.map((i) => i.inventoryItemId))] } } })
  if (found !== new Set(input.items.map((i) => i.inventoryItemId)).size) throw new AppError('ITEM_NOT_FOUND', 422, 'One of the pieces isn’t in the catalogue')
  const slug = input.slug ?? slugify(input.name)
  const clash = await db.inspiration.findFirst({ where: { slug, ...(id ? { id: { not: id } } : {}) } })
  if (clash) throw new AppError('SLUG_TAKEN', 409, 'Another concept already uses this web address')

  const data = {
    slug,
    name: input.name,
    eventTypes: input.eventTypes.map(eventTypeToDb),
    style: input.style,
    palette: input.palette,
    coverUrl: input.coverUrl,
    summary: input.summary,
    featured: input.featured,
    budgetTier: input.budgetTier,
  }
  const saved = await db.$transaction(async (tx) => {
    const before = id ? await tx.inspiration.findUnique({ where: { id } }) : null
    const row = id ? await tx.inspiration.update({ where: { id }, data }) : await tx.inspiration.create({ data: { ...data, published: false } })
    // Tiles and pieces are replaced as a whole: the editor always sends the full list.
    await tx.inspirationTile.deleteMany({ where: { inspirationId: row.id } })
    await tx.inspirationItem.deleteMany({ where: { inspirationId: row.id } })
    await tx.inspirationTile.createMany({ data: input.tiles.map((t, position) => ({ inspirationId: row.id, position, imageUrl: t.imageUrl, caption: t.caption ?? null })) })
    await tx.inspirationItem.createMany({
      data: input.items.map((it) => ({ inspirationId: row.id, inventoryItemId: it.inventoryItemId, category: it.category, qtyPer100Guests: it.qtyPer100Guests ?? null, qtyFixed: it.qtyFixed ?? null })),
    })
    await audit(tx, actor, id ? 'inspiration.update' : 'inspiration.create', 'Inspiration', row.id, { before, after: data, ip: meta.ip })
    return row
  })
  return toInspirationDto(db, await loadInspiration(db, saved.id))
}

export const createInspiration = (db: Db, actor: Actor, input: InspirationWriteBody, meta: Meta) =>
  writeInspiration(db, actor, null, inspirationWriteBody.parse(input), meta)

export async function updateInspiration(db: Db, actor: Actor, id: string, input: InspirationWriteBody, meta: Meta) {
  await loadInspiration(db, id)
  return writeInspiration(db, actor, id, inspirationWriteBody.parse(input), meta)
}

export async function setPublished(db: Db, actor: Actor, id: string, published: boolean, meta: Meta) {
  const i = await loadInspiration(db, id)
  if (published && (i.tiles.length === 0 || !i.coverUrl)) throw new AppError('INCOMPLETE', 422, 'Add a cover and at least one image before publishing')
  await db.$transaction(async (tx) => {
    await tx.inspiration.update({ where: { id }, data: { published } })
    await audit(tx, actor, published ? 'inspiration.publish' : 'inspiration.unpublish', 'Inspiration', id, { ip: meta.ip })
  })
  return toInspirationDto(db, await loadInspiration(db, id))
}

/** Only never-adopted concepts can be deleted; adopted ones are unpublished instead. */
export async function deleteInspiration(db: Db, actor: Actor, id: string, meta: Meta) {
  await loadInspiration(db, id)
  if (await db.moodboard.count({ where: { sourceInspirationId: id } })) {
    throw new AppError('IN_USE', 422, 'Clients adopted this concept — unpublish it instead')
  }
  await db.$transaction(async (tx) => {
    await tx.inspiration.delete({ where: { id } })
    await audit(tx, actor, 'inspiration.delete', 'Inspiration', id, { ip: meta.ip })
  })
}

// ─────────────── AR sets ───────────────

const arInclude = {
  event: { select: { name: true, concept: true, client: { select: { name: true } } } },
  assets: { orderBy: { name: 'asc' } },
  _count: { select: { notifyMe: { where: { notifiedAt: null } } } },
} satisfies Prisma.ARSetInclude
type ArRow = Prisma.ARSetGetPayload<{ include: typeof arInclude }>

async function toArDto(db: Db, s: ArRow): Promise<AdminArSetDto> {
  const modelIds = s.assets.flatMap((a) => (a.modelFileId ? [a.modelFileId] : []))
  const files = new Map((await db.file.findMany({ where: { id: { in: modelIds } }, select: { id: true, filename: true } })).map((f) => [f.id, f.filename]))
  return {
    id: s.id,
    eventId: s.eventId,
    eventName: s.event ? (s.event.concept ?? s.event.name) : null,
    clientName: s.event?.client.name ?? null,
    eventType: eventTypeFromDb(s.eventType),
    title: s.title,
    theme: s.theme,
    status: s.status === 'COMING_SOON' ? 'coming-soon' : (s.status.toLowerCase() as 'ready' | 'rendering'),
    progressPercent: s.progressPercent,
    eta: s.eta?.toISOString().slice(0, 10) ?? null,
    coverUrl: s.coverUrl,
    summary: s.summary,
    highlights: s.highlights,
    notifyCount: s._count.notifyMe,
    assets: s.assets.map((a) => ({ id: a.id, name: a.name, source: a.source, modelFileId: a.modelFileId, modelFilename: a.modelFileId ? (files.get(a.modelFileId) ?? null) : null })),
    updatedAt: s.updatedAt.toISOString(),
  }
}

/** Showcase sets plus the sets of the actor's clients. */
const arScope = (actor: Actor): Prisma.ARSetWhereInput => (actor.role === 'ADMIN' ? {} : { OR: [{ eventId: null }, { event: eventScope(actor) }] })

export async function listAdminArSets(db: Db, actor: Actor) {
  const rows = await db.aRSet.findMany({ where: arScope(actor), include: arInclude, orderBy: [{ updatedAt: 'desc' }] })
  return Promise.all(rows.map((r) => toArDto(db, r)))
}

async function loadSet(db: Db, actor: Actor, id: string, opts: { write?: boolean } = {}) {
  const s = UUID.test(id) ? await db.aRSet.findFirst({ where: { AND: [{ id }, arScope(actor)] }, include: arInclude }) : null
  if (!s) throw new AppError('AR_SET_NOT_FOUND', 404, 'AR set not found')
  // Showcase sets are Elation's own: consultants see them but only admins change them.
  if (opts.write && !s.eventId && actor.role !== 'ADMIN') throw new AppError('ADMIN_ONLY', 403, 'Only an admin can change a showcase set')
  return s
}

const statusToDb = (s: 'ready' | 'rendering' | 'coming-soon'): ARSetStatus => (s === 'coming-soon' ? 'COMING_SOON' : (s.toUpperCase() as ARSetStatus))

export async function createArSet(db: Db, actor: Actor, input: z.input<typeof arSetWriteBody>, meta: Meta) {
  const body = arSetWriteBody.parse(input)
  if (body.eventId) {
    await assertEventAccess(db, actor, body.eventId)
    if (await db.aRSet.findUnique({ where: { eventId: body.eventId } })) throw new AppError('AR_SET_EXISTS', 409, 'This event already has an AR set')
  } else if (actor.role !== 'ADMIN') {
    throw new AppError('ADMIN_ONLY', 403, 'Only an admin can add a showcase set')
  }
  const set = await db.$transaction(async (tx) => {
    const s = await tx.aRSet.create({
      data: {
        eventId: body.eventId ?? null,
        eventType: eventTypeToDb(body.eventType),
        title: body.title,
        theme: body.theme,
        coverUrl: body.coverUrl,
        summary: body.summary,
        highlights: body.highlights,
        aerialUrls: [],
        status: 'COMING_SOON',
      },
    })
    await audit(tx, actor, 'ar.create', 'ARSet', s.id, { after: body, ip: meta.ip })
    return s
  })
  return toArDto(db, await loadSet(db, actor, set.id))
}

export async function updateArSet(db: Db, actor: Actor, id: string, input: z.input<typeof arSetWriteBody>, meta: Meta) {
  const before = await loadSet(db, actor, id, { write: true })
  const body = arSetWriteBody.parse(input)
  await db.$transaction(async (tx) => {
    await tx.aRSet.update({
      where: { id },
      data: { eventType: eventTypeToDb(body.eventType), title: body.title, theme: body.theme, coverUrl: body.coverUrl, summary: body.summary, highlights: body.highlights },
    })
    await audit(tx, actor, 'ar.update', 'ARSet', id, { before: { title: before.title, theme: before.theme }, after: body, ip: meta.ip })
  })
  return toArDto(db, await loadSet(db, actor, id))
}

/** Status / progress / ETA. Turning READY emails everyone who asked to be notified. */
export async function setArStatus(
  deps: { db: Db; mailer: Mailer; appUrl: string; log: { warn: (o: object, m: string) => void } },
  actor: Actor,
  id: string,
  input: z.input<typeof arStatusBody>,
  meta: Meta,
) {
  const before = await loadSet(deps.db, actor, id, { write: true })
  const body = arStatusBody.parse(input)
  const status = statusToDb(body.status)
  await deps.db.$transaction(async (tx) => {
    await tx.aRSet.update({
      where: { id },
      data: { status, progressPercent: status === 'READY' ? 100 : body.progressPercent, eta: body.eta === undefined ? undefined : body.eta ? new Date(body.eta) : null },
    })
    if (before.eventId && status !== before.status) {
      const event = await tx.event.findUniqueOrThrow({ where: { id: before.eventId } })
      await tx.activityEntry.create({
        data: {
          clientId: event.clientId,
          eventId: event.id,
          actorId: actor.id,
          kind: 'AR',
          title: status === 'READY' ? `${before.title} is ready to preview` : status === 'RENDERING' ? `${before.title} is being built` : `${before.title} is coming soon`,
        },
      })
    }
    await audit(tx, actor, 'ar.status', 'ARSet', id, { before: { status: before.status, progressPercent: before.progressPercent }, after: body, ip: meta.ip })
  })
  if (status === 'READY') await notifySetReady(deps, id)
  return toArDto(deps.db, await loadSet(deps.db, actor, id))
}

export async function addArAsset(db: Db, actor: Actor, setId: string, input: z.input<typeof arAssetWriteBody>, meta: Meta) {
  await loadSet(db, actor, setId, { write: true })
  const body = arAssetWriteBody.parse(input)
  if (body.modelFileId) {
    const f = await db.file.findFirst({ where: { id: body.modelFileId, purpose: 'AR_MODEL', status: 'READY' } })
    if (!f) throw new AppError('MODEL_NOT_FOUND', 422, 'Upload the 3D model first')
  }
  await db.$transaction(async (tx) => {
    const a = await tx.aRAsset.create({
      data: { setId, name: body.name, source: body.source, modelFileId: body.modelFileId ?? null, inventoryItemId: body.inventoryItemId ?? null },
    })
    await tx.aRSet.update({ where: { id: setId }, data: { updatedAt: new Date() } })
    await audit(tx, actor, 'ar.asset.add', 'ARSet', setId, { after: { assetId: a.id, ...body }, ip: meta.ip })
  })
  return toArDto(db, await loadSet(db, actor, setId))
}

export async function removeArAsset(db: Db, actor: Actor, setId: string, assetId: string, meta: Meta) {
  await loadSet(db, actor, setId, { write: true })
  const { count } = await db.aRAsset.deleteMany({ where: { id: assetId, setId } })
  if (!count) throw new AppError('ASSET_NOT_FOUND', 404, 'Asset not found')
  await audit(db, actor, 'ar.asset.remove', 'ARSet', setId, { before: { assetId }, ip: meta.ip })
  return toArDto(db, await loadSet(db, actor, setId))
}
