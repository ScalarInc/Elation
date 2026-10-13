import {
  QUESTIONNAIRE_SCHEMA_VERSION,
  computeCategoryProgress,
  computeOverallPercent,
  type Answers,
} from '@elation/shared'
import type { CreateEventBody, EventDto, ListEventsQuery, UpdateEventBody } from '@elation/shared/api'
import { deriveNextStep, deriveProgress, deriveStatus, todayIso } from '@elation/shared/events'
import type { EventType as EventTypeLabel } from '@elation/shared/domain'
import type { Prisma, User } from '../../generated/prisma/client'
import { eventTypeFromDb, eventTypeToDb, venueSettingFromDb, venueSettingToDb } from '../../lib/enums'
import { AppError } from '../../lib/errors'
import { assertClientAccess, assertEventAccess, eventScope } from '../../lib/policy'
import { ensureThreadsTx } from '../../lib/threads'
import type { Db, DbTx } from '../../plugins/db'

type Actor = Pick<User, 'id' | 'role'>

/** What every EventDto needs loaded alongside the event row. */
export const eventInclude = {
  questionnaire: { select: { percentComplete: true, submittedAt: true } },
  moodboards: { select: { status: true, isPrimary: true } },
  budgetPlan: { select: { status: true } },
  arSet: { select: { status: true } },
} satisfies Prisma.EventInclude

type EventRow = Prisma.EventGetPayload<{ include: typeof eventInclude }>

/** Stock cover per event type until the client uploads one (Step 11). */
const STOCK_COVERS: Partial<Record<EventTypeLabel, string>> = {
  Mehndi: '/media/img_18.jpg',
  Mayoun: '/media/img_18.jpg',
  Baraat: '/media/img_04.jpg',
  Walima: '/media/img_16.jpg',
  Nikkah: '/media/img_17.png',
  Engagement: '/media/img_13.jpg',
  Dinner: '/media/img_10.jpg',
  Qawwali: '/media/img_09.png',
}
const DEFAULT_COVER = '/media/img_11.jpg'

export function toEventDto(e: EventRow, today = todayIso()): EventDto {
  const type = eventTypeFromDb(e.type)
  const date = (e.date ?? e.createdAt).toISOString().slice(0, 10)
  const progress = deriveProgress({
    questionnaire: e.questionnaire,
    moodboards: e.moodboards,
    budgetPlan: e.budgetPlan,
    arSet: e.arSet,
  })
  const questionnairePercent = e.questionnaire?.percentComplete ?? 0
  return {
    id: e.id,
    clientId: e.clientId,
    name: e.name,
    concept: e.concept,
    type,
    date,
    venue: {
      name: e.venueName ?? '',
      city: e.venueCity ?? '',
      indoor: e.venueSetting ? venueSettingFromDb(e.venueSetting) : 'Indoor',
    },
    guests: e.guests ?? 0,
    budgetPKR: e.budgetPkr,
    coverImage: e.coverUrl ?? STOCK_COVERS[type] ?? DEFAULT_COVER,
    status: deriveStatus(e.status, date, today),
    progress,
    questionnairePercent,
    nextStep: deriveNextStep(e.id, progress, questionnairePercent),
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  }
}

// ─────────────── Reads ───────────────

export async function listEvents(db: Db, actor: Actor, query: Required<Omit<ListEventsQuery, 'clientId'>> & { clientId?: string }) {
  if (query.clientId) await assertClientAccess(db, actor, query.clientId)
  const rows = await db.event.findMany({
    where: { AND: [eventScope(actor), query.clientId ? { clientId: query.clientId } : {}] },
    include: eventInclude,
  })
  const today = todayIso()
  let events = rows.map((r) => toEventDto(r, today))

  // Archived events only show under their own filter.
  events = events.filter((e) => {
    switch (query.status) {
      case 'all':
        return e.status !== 'archived'
      case 'upcoming':
        return e.status === 'active'
      default:
        return e.status === query.status
    }
  })

  return events.sort((a, b) => {
    if (query.sort === 'name') return (a.concept ?? a.name).localeCompare(b.concept ?? b.name)
    const diff = a.date.localeCompare(b.date)
    return query.sort === 'date_asc' ? diff : -diff
  })
}

export async function getEvent(db: Db, actor: Actor, eventId: string) {
  await assertEventAccess(db, actor, eventId)
  return toEventDto(await db.event.findUniqueOrThrow({ where: { id: eventId }, include: eventInclude }))
}

// ─────────────── Questionnaire write-through (decision P3) ───────────────

type Basics = {
  type: EventTypeLabel
  concept: string | null
  date: string | null
  guests: number | null
  venueName: string | null
  venueSetting: 'Indoor' | 'Outdoor' | 'Both' | null
}

/** Event basics as questionnaire answers (q1–q6). */
function basicsAsAnswers(b: Basics): Answers {
  const answers: Answers = { q1_type: b.type }
  if (b.concept) answers.q2_name = b.concept
  if (b.date) answers.q3_date = b.date
  if (b.guests) answers.q4_guests = b.guests
  if (b.venueName) answers.q5_venue = b.venueName
  if (b.venueSetting) answers.q6_indoor = b.venueSetting
  return answers
}

/**
 * Keep the questionnaire's event-basics answers equal to the event columns.
 * Creates the response if the event has none yet; records a revision of what changed.
 */
async function syncBasicsToQuestionnaire(tx: DbTx, eventId: string, basics: Basics, actorId: string) {
  const incoming = basicsAsAnswers(basics)
  const existing = await tx.questionnaireResponse.findUnique({ where: { eventId } })
  const before = (existing?.answers ?? {}) as Answers
  const decides = (existing?.elationDecides ?? {}) as Record<string, boolean>

  const changes = Object.entries(incoming)
    .filter(([qid, value]) => JSON.stringify(before[qid]) !== JSON.stringify(value))
    .map(([qid, to]) => ({ qid, from: before[qid] ?? null, to }))
  if (existing && changes.length === 0) return

  const answers = { ...before, ...incoming }
  // An explicit answer cancels "Elation decides" for that question.
  const nextDecides = { ...decides }
  for (const { qid } of changes) delete nextDecides[qid]
  const percentComplete = computeOverallPercent(computeCategoryProgress(answers, nextDecides))

  if (existing) {
    await tx.questionnaireResponse.update({
      where: { eventId },
      data: {
        answers: answers as Prisma.InputJsonValue,
        elationDecides: nextDecides,
        percentComplete,
        version: { increment: 1 },
        updatedById: actorId,
        revisions: { create: { actorId, changes: changes as Prisma.InputJsonValue } },
      },
    })
  } else {
    await tx.questionnaireResponse.create({
      data: {
        eventId,
        schemaVersion: QUESTIONNAIRE_SCHEMA_VERSION,
        answers: answers as Prisma.InputJsonValue,
        percentComplete,
        updatedById: actorId,
        revisions: { create: { actorId, changes: changes as Prisma.InputJsonValue } },
      },
    })
  }
}

// ─────────────── Writes ───────────────

export async function createEvent(db: Db, actor: Actor, input: CreateEventBody) {
  let clientId = actor.id
  if (actor.role !== 'CLIENT') {
    if (!input.clientId) throw new AppError('CLIENT_REQUIRED', 422, 'Choose which client this event is for')
    clientId = (await assertClientAccess(db, actor, input.clientId)).id
  }

  const event = await db.$transaction(async (tx) => {
    const created = await tx.event.create({
      data: {
        clientId,
        name: input.concept,
        concept: input.concept,
        type: eventTypeToDb(input.type),
        date: new Date(input.date),
        guests: input.guests,
        venueName: input.venueName,
        venueCity: input.city,
        venueSetting: venueSettingToDb(input.venueSetting),
        budgetPkr: input.budgetPkr ?? null,
      },
    })
    await syncBasicsToQuestionnaire(
      tx,
      created.id,
      {
        type: input.type,
        concept: input.concept,
        date: input.date,
        guests: input.guests,
        venueName: input.venueName,
        venueSetting: input.venueSetting,
      },
      actor.id,
    )
    await tx.activityEntry.create({
      data: {
        clientId,
        eventId: created.id,
        actorId: actor.id,
        kind: 'EVENT',
        title: `${input.concept} created`,
        detail: `${input.type} · ${input.guests} guests · ${input.venueName}`,
      },
    })
    // The event's own thread with the consultant.
    await ensureThreadsTx(tx, clientId)
    return created
  })

  return getEvent(db, actor, event.id)
}

export async function updateEvent(db: Db, actor: Actor, eventId: string, input: UpdateEventBody) {
  const current = await assertEventAccess(db, actor, eventId)
  if (current.status === 'ARCHIVED') {
    throw new AppError('EVENT_ARCHIVED', 422, 'Unarchive this event before editing it')
  }

  await db.$transaction(async (tx) => {
    const updated = await tx.event.update({
      where: { id: eventId },
      data: {
        ...(input.concept !== undefined && { concept: input.concept, name: input.concept }),
        ...(input.type !== undefined && { type: eventTypeToDb(input.type) }),
        ...(input.date !== undefined && { date: new Date(input.date) }),
        ...(input.guests !== undefined && { guests: input.guests }),
        ...(input.venueName !== undefined && { venueName: input.venueName }),
        ...(input.city !== undefined && { venueCity: input.city }),
        ...(input.venueSetting !== undefined && { venueSetting: venueSettingToDb(input.venueSetting) }),
        ...(input.budgetPkr !== undefined && { budgetPkr: input.budgetPkr }),
      },
    })
    // The budget plan's target follows the event budget (docs/step-08-budget.md).
    // Version bump: an open estimator must reload rather than save its old target back.
    if (input.budgetPkr != null) {
      await tx.budgetPlan.updateMany({ where: { eventId }, data: { targetPkr: input.budgetPkr, version: { increment: 1 }, updatedById: actor.id } })
    }
    await syncBasicsToQuestionnaire(
      tx,
      eventId,
      {
        type: eventTypeFromDb(updated.type),
        concept: updated.concept,
        date: updated.date?.toISOString().slice(0, 10) ?? null,
        guests: updated.guests,
        venueName: updated.venueName,
        venueSetting: updated.venueSetting ? venueSettingFromDb(updated.venueSetting) : null,
      },
      actor.id,
    )
  })

  return getEvent(db, actor, eventId)
}

/** Copy basics + questionnaire answers into a new DRAFT (not moodboards or budget). */
export async function duplicateEvent(db: Db, actor: Actor, eventId: string) {
  const source = await assertEventAccess(db, actor, eventId)
  const questionnaire = await db.questionnaireResponse.findUnique({ where: { eventId } })
  const concept = `${source.concept ?? source.name} (copy)`

  const copy = await db.$transaction(async (tx) => {
    const created = await tx.event.create({
      data: {
        clientId: source.clientId,
        name: concept,
        concept,
        type: source.type,
        date: source.date,
        guests: source.guests,
        venueName: source.venueName,
        venueCity: source.venueCity,
        venueSetting: source.venueSetting,
        budgetPkr: source.budgetPkr,
        budgetBand: source.budgetBand,
        coverUrl: source.coverUrl,
        status: 'DRAFT',
      },
    })
    const answers = { ...((questionnaire?.answers ?? {}) as Answers), q2_name: concept }
    const decides = (questionnaire?.elationDecides ?? {}) as Record<string, boolean>
    await tx.questionnaireResponse.create({
      data: {
        eventId: created.id,
        schemaVersion: QUESTIONNAIRE_SCHEMA_VERSION,
        answers: answers as Prisma.InputJsonValue,
        elationDecides: decides,
        percentComplete: computeOverallPercent(computeCategoryProgress(answers, decides)),
        updatedById: actor.id,
      },
    })
    await tx.activityEntry.create({
      data: {
        clientId: source.clientId,
        eventId: created.id,
        actorId: actor.id,
        kind: 'EVENT',
        title: `${concept} created`,
        detail: `Duplicated from ${source.concept ?? source.name}`,
      },
    })
    return created
  })

  return getEvent(db, actor, copy.id)
}

export async function setArchived(db: Db, actor: Actor, eventId: string, archived: boolean) {
  const event = await assertEventAccess(db, actor, eventId)
  if (archived !== (event.status === 'ARCHIVED')) {
    // Unarchiving returns to ACTIVE; drafts become active once they have been worked on enough.
    await db.event.update({ where: { id: eventId }, data: { status: archived ? 'ARCHIVED' : 'ACTIVE' } })
  }
  return getEvent(db, actor, eventId)
}

/** Soft delete — only drafts whose budget was never sent to Elation. */
export async function deleteEvent(db: Db, actor: Actor, eventId: string) {
  const event = await assertEventAccess(db, actor, eventId)
  const plan = await db.budgetPlan.findUnique({ where: { eventId } })
  if (event.status !== 'DRAFT' || (plan && plan.status !== 'DRAFT')) {
    throw new AppError(
      'EVENT_NOT_DELETABLE',
      422,
      'Only draft events can be deleted. Archive this event instead.',
    )
  }
  await db.event.update({ where: { id: eventId }, data: { deletedAt: new Date() } })
}
