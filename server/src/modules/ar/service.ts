import type { ArAssetDto, ArSessionRequestBody, ArSetDto, EventArResponse } from '@elation/shared/api'
import type { Prisma, User } from '../../generated/prisma/client'
import { arReadyEmail, arSessionRequestEmail } from '../../lib/emails'
import { eventTypeFromDb, inventoryCategoryFromDb } from '../../lib/enums'
import { AppError } from '../../lib/errors'
import type { Mailer } from '../../lib/mailer'
import { assertEventAccess, eventScope } from '../../lib/policy'
import { postSystemMessage } from '../../lib/threads'
import type { Bucket, Storage } from '../../lib/storage'
import type { Db } from '../../plugins/db'

type Actor = Pick<User, 'id' | 'role'>
type Deps = { db: Db; mailer: Mailer; appUrl: string; log: { warn: (obj: object, msg: string) => void } }

const STATUS = { READY: 'ready', RENDERING: 'rendering', COMING_SOON: 'coming-soon' } as const

const setInclude = (userId: string) =>
  ({
    _count: { select: { assets: true } },
    notifyMe: { where: { userId }, select: { id: true } },
  }) satisfies Prisma.ARSetInclude
type SetRow = Prisma.ARSetGetPayload<{ include: ReturnType<typeof setInclude> }>

function toDto(s: SetRow): ArSetDto {
  return {
    id: s.id,
    eventId: s.eventId,
    eventType: eventTypeFromDb(s.eventType),
    title: s.title,
    theme: s.theme,
    status: STATUS[s.status],
    progressPercent: s.progressPercent,
    eta: s.eta?.toISOString().slice(0, 10) ?? null,
    coverImage: s.coverUrl,
    floorPlan: s.floorPlanUrl,
    aerialViews: s.aerialUrls,
    assetCount: s._count.assets,
    summary: s.summary,
    highlights: s.highlights,
    notifyRequested: s.notifyMe.length > 0,
  }
}

/** A set the actor may see: one on their own (or their clients') events, or an Elation showcase set. */
async function assertSetAccess(db: Db, actor: Actor, setId: string) {
  const set = /^[0-9a-f-]{36}$/i.test(setId)
    ? await db.aRSet.findFirst({
        where: { id: setId, OR: [{ eventId: null }, { event: eventScope(actor) }] },
        include: setInclude(actor.id),
      })
    : null
  if (!set) throw new AppError('AR_SET_NOT_FOUND', 404, 'AR set not found')
  return set
}

// ─────────────── Reads ───────────────

/** The actor's own sets, then a showcase set for each event type they don't have one for yet. */
export async function listArSets(db: Db, actor: Actor): Promise<ArSetDto[]> {
  const own = await db.aRSet.findMany({
    where: { event: { AND: [eventScope(actor), { status: { not: 'ARCHIVED' } }] } },
    include: { ...setInclude(actor.id), event: { select: { date: true } } },
    orderBy: { createdAt: 'asc' },
  })
  own.sort((a, b) => (a.event?.date?.getTime() ?? 0) - (b.event?.date?.getTime() ?? 0))
  const covered = new Set(own.map((s) => s.eventType))
  const showcase = await db.aRSet.findMany({ where: { eventId: null }, include: setInclude(actor.id), orderBy: { createdAt: 'asc' } })
  return [...own, ...showcase.filter((s) => !covered.has(s.eventType))].map(toDto)
}

export async function getEventAr(db: Db, actor: Actor, eventId: string): Promise<EventArResponse> {
  const event = await assertEventAccess(db, actor, eventId)
  const set = await db.aRSet.findUnique({ where: { eventId }, include: setInclude(actor.id) })
  if (set) return { set: toDto(set), showcase: null }
  const showcase = await db.aRSet.findFirst({ where: { eventId: null, eventType: event.type }, include: setInclude(actor.id) })
  return { set: null, showcase: showcase ? toDto(showcase) : null }
}

export async function listArAssets(db: Db, storage: Storage, actor: Actor, setId: string): Promise<ArAssetDto[]> {
  await assertSetAccess(db, actor, setId)
  const assets = await db.aRAsset.findMany({ where: { setId }, orderBy: { name: 'asc' } })
  const itemIds = assets.flatMap((a) => (a.inventoryItemId ? [a.inventoryItemId] : []))
  const items = new Map((await db.inventoryItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, category: true } })).map((i) => [i.id, i]))
  const modelIds = assets.flatMap((a) => (a.modelFileId ? [a.modelFileId] : []))
  const models = new Map((await db.file.findMany({ where: { id: { in: modelIds }, status: 'READY', purpose: 'AR_MODEL' } })).map((f) => [f.id, f]))
  return Promise.all(assets.map(async (a) => {
    const model = a.modelFileId ? models.get(a.modelFileId) : undefined
    return {
    id: a.id,
    name: a.name,
    category: a.inventoryItemId && items.has(a.inventoryItemId) ? inventoryCategoryFromDb(items.get(a.inventoryItemId)!.category) : null,
    thumbnailUrl: a.thumbnailUrl,
    source: a.source,
    // Private bucket: a fresh 10-minute link per request, never stored.
    downloadUrl: model ? await storage.presignGet('private' satisfies Bucket, model.key, { expiresIn: 600, filename: model.filename }) : null,
    }
  }))
}

// ─────────────── Requests ───────────────

/** "Book a headset session": activity + a message in the client's thread + an email to the consultant. */
export async function requestSession(deps: Deps, actor: Actor, eventId: string, body: ArSessionRequestBody) {
  const event = await assertEventAccess(deps.db, actor, eventId)
  const client = await deps.db.user.findUniqueOrThrow({ where: { id: event.clientId }, include: { consultant: true } })
  const when = body.preferredDate ? ` (preferred date ${body.preferredDate})` : ''
  const eventName = event.concept ?? event.name
  await deps.db.$transaction(async (tx) => {
    await tx.activityEntry.create({
      data: {
        clientId: event.clientId,
        eventId,
        actorId: actor.id,
        kind: 'AR',
        title: 'Asked for an AR headset session',
        detail: [body.preferredDate && `Preferred date: ${body.preferredDate}`, body.note].filter(Boolean).join(' — ') || undefined,
        meta: { request: 'ar-session', preferredDate: body.preferredDate ?? null },
      },
    })
    await postSystemMessage(tx, {
      clientId: event.clientId,
      eventId,
      body: `${client.name} asked for an AR headset session for ${eventName}${when}.${body.note ? `\n\n“${body.note}”` : ''}`,
      meta: { type: 'ar.session-request', eventId },
    })
  })
  if (client.consultant) {
    await deps.mailer
      .send(
        arSessionRequestEmail({
          to: client.consultant.email,
          consultantName: client.consultant.name,
          clientName: client.name,
          eventName,
          preferredDate: body.preferredDate,
          note: body.note,
          url: `${deps.appUrl}/events/${eventId}/ar`,
        }),
      )
      .catch((err: unknown) => deps.log.warn({ err, eventId }, 'AR session email failed'))
  }
  return { consultantName: client.consultant?.name ?? null }
}

/** "Notify me" on a set that isn't ready yet. Idempotent. */
export async function requestNotify(db: Db, actor: Actor, setId: string) {
  const set = await assertSetAccess(db, actor, setId)
  if (set.status === 'READY') throw new AppError('AR_SET_READY', 422, 'This set is already ready to preview')
  await db.aRNotifyRequest.upsert({
    where: { setId_userId: { setId, userId: actor.id } },
    create: { setId, userId: actor.id },
    update: {},
  })
}

/**
 * When a set turns READY (admin, Step 12): email everyone who asked, once.
 * Returns how many were notified.
 */
export async function notifySetReady(deps: Deps, setId: string) {
  const set = await deps.db.aRSet.findUniqueOrThrow({ where: { id: setId } })
  if (set.status !== 'READY') return 0
  const pending = await deps.db.aRNotifyRequest.findMany({ where: { setId, notifiedAt: null }, include: { user: true } })
  for (const request of pending) {
    // Claim first, so two status flips at once can't email the same person twice.
    const claimed = await deps.db.aRNotifyRequest.updateMany({ where: { id: request.id, notifiedAt: null }, data: { notifiedAt: new Date() } })
    if (claimed.count === 0) continue
    try {
      await deps.mailer.send(
        arReadyEmail({ to: request.user.email, name: request.user.name, setTitle: set.title, url: `${deps.appUrl}${set.eventId ? `/events/${set.eventId}/ar` : '/ar'}` }),
      )
    } catch (err) {
      await deps.db.aRNotifyRequest.update({ where: { id: request.id }, data: { notifiedAt: null } })
      deps.log.warn({ err, setId, userId: request.userId }, 'AR ready email failed — will retry next time')
    }
  }
  return pending.length
}
