import {
  QUESTIONNAIRE_SCHEMA_VERSION,
  categories,
  computeCategoryProgress,
  computeOverallPercent,
  isAnswered,
  missingRequired,
  questionById,
  questions,
  validateAnswers,
  visibleQuestions,
  type Answers,
  type Question,
} from '@elation/shared'
import type {
  PatchQuestionnaireBody,
  QuestionnaireBrief,
  QuestionnaireDto,
  QuestionnaireRevisionDto,
} from '@elation/shared/api'
import { BUDGET_BAND_MIDPOINTS } from '@elation/shared/budget'
import { EVENT_TYPES, VENUE_SETTINGS, type EventType, type VenueSetting } from '@elation/shared/domain'
import type { Event, Prisma, QuestionnaireResponse, User } from '../../generated/prisma/client'
import { eventTypeToDb, venueSettingToDb } from '../../lib/enums'
import { AppError } from '../../lib/errors'
import { assertEventAccess } from '../../lib/policy'
import type { Db, DbTx } from '../../plugins/db'

type Actor = Pick<User, 'id' | 'role'>
type Change = { qid: string; from: unknown; to: unknown; decides?: boolean }

/** Drafts become active once the client is a quarter of the way through. */
const ACTIVATE_AT_PERCENT = 25
/** Questionnaire edits within this window update one activity entry instead of adding many. */
const ACTIVITY_WINDOW_MS = 30 * 60 * 1000

function toDto(eventId: string, r: QuestionnaireResponse | null): QuestionnaireDto {
  const answers = (r?.answers ?? {}) as Answers
  const decides = (r?.elationDecides ?? {}) as Record<string, boolean>
  return {
    eventId,
    schemaVersion: r?.schemaVersion ?? QUESTIONNAIRE_SCHEMA_VERSION,
    answers,
    elationDecides: decides,
    percentComplete: r?.percentComplete ?? 0,
    categories: computeCategoryProgress(answers, decides),
    submittedAt: r?.submittedAt?.toISOString() ?? null,
    version: r?.version ?? 0,
    updatedAt: r?.updatedAt.toISOString() ?? null,
  }
}

export async function getQuestionnaire(db: Db, actor: Actor, eventId: string) {
  await assertEventAccess(db, actor, eventId)
  return toDto(eventId, await db.questionnaireResponse.findUnique({ where: { eventId } }))
}

// ─────────────── Validation ───────────────

function validatePatch(body: PatchQuestionnaireBody) {
  const issues = validateAnswers(body.set ?? {})
  for (const [qid, on] of Object.entries(body.decides ?? {})) {
    const q = questionById.get(qid)
    if (!q) issues.push({ qid, message: 'Unknown question' })
    else if (on && !q.elationDecides) issues.push({ qid, message: 'Elation can’t decide this one for you' })
  }
  for (const qid of body.clear ?? []) {
    if (!questionById.has(qid)) issues.push({ qid, message: 'Unknown question' })
  }
  if (issues.length) throw new AppError('INVALID_ANSWERS', 400, 'Some answers aren’t valid', { issues })
}

// ─────────────── Answers → event (decision P3, other direction in events service) ───────────────

async function writeThroughToEvent(tx: DbTx, event: Event, answers: Answers, changed: Set<string>) {
  const data: Prisma.EventUpdateInput = {}
  const a = answers

  if (changed.has('q1_type') && EVENT_TYPES.includes(a.q1_type as EventType)) {
    data.type = eventTypeToDb(a.q1_type as EventType)
  }
  if (changed.has('q2_name') && typeof a.q2_name === 'string' && a.q2_name.trim()) {
    data.concept = a.q2_name.trim()
    data.name = a.q2_name.trim()
  }
  if (changed.has('q3_date') && typeof a.q3_date === 'string') data.date = new Date(a.q3_date)
  if (changed.has('q4_guests') && typeof a.q4_guests === 'number' && a.q4_guests > 0) data.guests = a.q4_guests
  if (changed.has('q5_venue') && typeof a.q5_venue === 'string' && a.q5_venue.trim()) {
    data.venueName = a.q5_venue.trim()
  }
  if (changed.has('q6_indoor') && VENUE_SETTINGS.includes(a.q6_indoor as VenueSetting)) {
    data.venueSetting = venueSettingToDb(a.q6_indoor as VenueSetting)
  }
  if (changed.has('q121_budget') && typeof a.q121_budget === 'string') {
    data.budgetBand = a.q121_budget
    // A band only sets the budget when there is none yet, or when the current
    // figure is just the previous band's midpoint — an explicit number wins.
    const previousMidpoint = event.budgetBand ? BUDGET_BAND_MIDPOINTS[event.budgetBand] : undefined
    const midpoint = BUDGET_BAND_MIDPOINTS[a.q121_budget]
    if (midpoint && (event.budgetPkr == null || event.budgetPkr === previousMidpoint)) data.budgetPkr = midpoint
  }

  if (Object.keys(data).length) await tx.event.update({ where: { id: event.id }, data })
  // Bump the plan version so an open estimator can't save its old target back over this one.
  if (typeof data.budgetPkr === 'number') {
    await tx.budgetPlan.updateMany({ where: { eventId: event.id }, data: { targetPkr: data.budgetPkr, version: { increment: 1 } } })
  }
}

async function recordActivity(tx: DbTx, event: Event, actorId: string, touchedCategories: string[]) {
  const recent = await tx.activityEntry.findFirst({
    where: { eventId: event.id, kind: 'QUESTIONNAIRE', title: 'Questionnaire updated', createdAt: { gte: new Date(Date.now() - ACTIVITY_WINDOW_MS) } },
    orderBy: { createdAt: 'desc' },
  })
  const previous = (recent?.meta as { categories?: string[] } | null)?.categories ?? []
  const merged = [...new Set([...previous, ...touchedCategories])]
  const order = new Map(categories.map((c) => [c.title, c.order]))
  merged.sort((x, y) => (order.get(x) ?? 0) - (order.get(y) ?? 0))
  const detail = merged.join(', ')

  if (recent) {
    await tx.activityEntry.update({ where: { id: recent.id }, data: { detail, meta: { categories: merged }, createdAt: new Date() } })
  } else {
    await tx.activityEntry.create({
      data: { clientId: event.clientId, eventId: event.id, actorId, kind: 'QUESTIONNAIRE', title: 'Questionnaire updated', detail, meta: { categories: merged } },
    })
  }
}

// ─────────────── Save ───────────────

export async function patchQuestionnaire(db: Db, actor: Actor, eventId: string, body: PatchQuestionnaireBody) {
  const event = await assertEventAccess(db, actor, eventId)
  if (event.status === 'ARCHIVED') throw new AppError('EVENT_ARCHIVED', 422, 'Unarchive this event before editing it')
  validatePatch(body)

  return db.$transaction(async (tx) => {
    const existing = await tx.questionnaireResponse.findUnique({ where: { eventId } })
    const currentVersion = existing?.version ?? 0
    if (body.version !== currentVersion) {
      throw new AppError('VERSION_CONFLICT', 409, 'These answers changed in another session', {
        current: toDto(eventId, existing),
      })
    }

    const answers = { ...((existing?.answers ?? {}) as Answers) }
    const decides = { ...((existing?.elationDecides ?? {}) as Record<string, boolean>) }
    const changes: Change[] = []

    for (const [qid, value] of Object.entries(body.set ?? {})) {
      if (JSON.stringify(answers[qid]) !== JSON.stringify(value) || decides[qid]) {
        changes.push({ qid, from: answers[qid] ?? null, to: value })
      }
      answers[qid] = value
      delete decides[qid] // an explicit answer cancels "Elation decides"
    }
    for (const qid of body.clear ?? []) {
      if (qid in answers) changes.push({ qid, from: answers[qid], to: null })
      delete answers[qid]
    }
    for (const [qid, on] of Object.entries(body.decides ?? {})) {
      if (on && !decides[qid]) {
        changes.push({ qid, from: answers[qid] ?? null, to: null, decides: true })
        delete answers[qid]
        decides[qid] = true
      } else if (!on && decides[qid]) {
        changes.push({ qid, from: null, to: null, decides: false })
        delete decides[qid]
      }
    }

    if (changes.length === 0) return toDto(eventId, existing)

    const percentComplete = computeOverallPercent(computeCategoryProgress(answers, decides))
    const data = {
      answers: answers as Prisma.InputJsonValue,
      elationDecides: decides,
      percentComplete,
      schemaVersion: QUESTIONNAIRE_SCHEMA_VERSION,
      updatedById: actor.id,
      version: currentVersion + 1,
    }

    let saved: QuestionnaireResponse
    if (existing) {
      // Conditional on the version we read: a concurrent save makes this throw P2025 → 409.
      saved = await tx.questionnaireResponse
        .update({ where: { eventId, version: currentVersion }, data })
        .catch((err: { code?: string }) => {
          if (err.code === 'P2025') throw new AppError('VERSION_CONFLICT', 409, 'These answers changed in another session')
          throw err
        })
    } else {
      saved = await tx.questionnaireResponse.create({ data: { eventId, ...data } })
    }

    await tx.questionnaireRevision.create({
      data: { eventId, actorId: actor.id, changes: changes as unknown as Prisma.InputJsonValue },
    })

    const changed = new Set(changes.map((c) => c.qid))
    await writeThroughToEvent(tx, event, answers, changed)
    if (event.status === 'DRAFT' && percentComplete >= ACTIVATE_AT_PERCENT) {
      await tx.event.update({ where: { id: eventId }, data: { status: 'ACTIVE' } })
    }

    const touched = [...new Set(changes.map((c) => questionById.get(c.qid)!.category))]
    await recordActivity(tx, event, actor.id, touched)

    return toDto(eventId, saved)
  })
}

// ─────────────── Submit / reopen ───────────────

export async function submitQuestionnaire(db: Db, actor: Actor, eventId: string) {
  const event = await assertEventAccess(db, actor, eventId)
  const existing = await db.questionnaireResponse.findUnique({ where: { eventId } })
  const answers = (existing?.answers ?? {}) as Answers
  const decides = (existing?.elationDecides ?? {}) as Record<string, boolean>
  const missing = missingRequired(answers, decides)
  if (!existing || missing.length) {
    throw new AppError('QUESTIONNAIRE_INCOMPLETE', 422, 'A few required questions still need an answer', {
      missing: existing ? missing : missingRequired({}, {}),
    })
  }
  if (existing.submittedAt) return toDto(eventId, existing)

  const saved = await db.$transaction(async (tx) => {
    const updated = await tx.questionnaireResponse.update({
      where: { eventId },
      data: { submittedAt: new Date(), version: { increment: 1 }, updatedById: actor.id },
    })
    if (event.status === 'DRAFT') await tx.event.update({ where: { id: eventId }, data: { status: 'ACTIVE' } })
    await tx.activityEntry.create({
      data: {
        clientId: event.clientId,
        eventId,
        actorId: actor.id,
        kind: 'QUESTIONNAIRE',
        title: 'Questionnaire submitted',
        detail: `${updated.percentComplete}% answered — Elation is curating your concept.`,
      },
    })
    return updated
  })
  return toDto(eventId, saved)
}

export async function reopenQuestionnaire(db: Db, actor: Actor, eventId: string) {
  await assertEventAccess(db, actor, eventId)
  const existing = await db.questionnaireResponse.findUnique({ where: { eventId } })
  if (!existing?.submittedAt) return toDto(eventId, existing)
  const saved = await db.questionnaireResponse.update({
    where: { eventId },
    data: { submittedAt: null, version: { increment: 1 }, updatedById: actor.id },
  })
  return toDto(eventId, saved)
}

// ─────────────── Brief + history ───────────────

export function formatAnswer(q: Question, value: unknown): string {
  if (Array.isArray(value)) {
    return q.kind === 'upload' ? `${value.length} file${value.length === 1 ? '' : 's'}` : value.join(', ')
  }
  if (q.kind === 'dimensions' && value && typeof value === 'object') {
    const { w, d, h } = value as { w?: number; d?: number; h?: number }
    return [w, d, h].filter((n) => n != null).join(' × ') + ' ft'
  }
  if (q.kind === 'color' && value && typeof value === 'object') {
    const { desc, hex } = value as { desc?: string; hex?: string[] }
    return [desc, hex?.length ? hex.join(' ') : undefined].filter(Boolean).join(' — ')
  }
  return String(value)
}

export async function getBrief(db: Db, actor: Actor, eventId: string): Promise<QuestionnaireBrief> {
  await assertEventAccess(db, actor, eventId)
  const r = await db.questionnaireResponse.findUnique({ where: { eventId } })
  const answers = (r?.answers ?? {}) as Answers
  const decides = (r?.elationDecides ?? {}) as Record<string, boolean>
  const visible = visibleQuestions(questions, answers)

  return {
    eventId,
    submittedAt: r?.submittedAt?.toISOString() ?? null,
    categories: categories
      .map((c) => ({
        slug: c.slug,
        title: c.title,
        items: visible
          .filter((q) => q.category === c.title && (isAnswered(answers[q.id]) || decides[q.id]))
          .map((q) => ({
            qid: q.id,
            label: q.label,
            answer: decides[q.id] ? null : formatAnswer(q, answers[q.id]),
            elationDecides: Boolean(decides[q.id]),
          })),
      }))
      .filter((c) => c.items.length > 0),
  }
}

export async function listRevisions(
  db: Db,
  actor: Actor,
  eventId: string,
  opts: { cursor?: string; limit: number },
): Promise<{ items: QuestionnaireRevisionDto[]; nextCursor: string | null }> {
  if (actor.role === 'CLIENT') throw new AppError('FORBIDDEN', 403, 'Only the Elation team can see answer history')
  await assertEventAccess(db, actor, eventId)
  const rows = await db.questionnaireRevision.findMany({
    where: { eventId, ...(opts.cursor ? { id: { lt: opts.cursor } } : {}) },
    orderBy: { id: 'desc' },
    take: opts.limit + 1,
  })
  const page = rows.slice(0, opts.limit)
  const actorIds = [...new Set(page.map((r) => r.actorId).filter((id): id is string => Boolean(id)))]
  const actors = await db.user.findMany({
    // `deletedAt: {}` opts out of the soft-delete filter: history keeps names of removed users.
    where: { id: { in: actorIds }, deletedAt: {} },
    select: { id: true, name: true, role: true },
  })
  const byId = new Map(actors.map((a) => [a.id, a]))
  return {
    items: page.map((r) => ({
      id: r.id,
      actor: r.actorId && byId.get(r.actorId)
        ? { id: r.actorId, name: byId.get(r.actorId)!.name, role: byId.get(r.actorId)!.role.toLowerCase() }
        : null,
      changes: r.changes as QuestionnaireRevisionDto['changes'],
      createdAt: r.createdAt.toISOString(),
    })),
    nextCursor: rows.length > opts.limit ? page.at(-1)!.id : null,
  }
}
