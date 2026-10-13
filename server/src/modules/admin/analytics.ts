import type { AnalyticsDto, AnalyticsQuery, CountRow, OverviewDto } from '@elation/shared/api'
import { budgetTotals, classifyBudget } from '@elation/shared/budget'
import type { Prisma, User } from '../../generated/prisma/client'
import { eventTypeFromDb } from '../../lib/enums'
import type { Db } from '../../plugins/db'
import { followUps } from './notes'

type Actor = Pick<User, 'id' | 'role'>

/**
 * Overview & analytics (docs/step-12-admin.md). Computed from the live tables
 * for the actor's clients (consultants: their own; admins: all, or one
 * consultant's with `consultantId`), cached for 5 minutes per scope.
 */

const CACHE_MS = 5 * 60 * 1000
const cache = new Map<string, { at: number; value: unknown }>()

async function cached<T>(key: string, fn: () => Promise<T>, fresh = false): Promise<T> {
  const hit = cache.get(key)
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.value as T
  const value = await fn()
  cache.set(key, { at: Date.now(), value })
  if (cache.size > 500) cache.delete(cache.keys().next().value!)
  return value
}

/** Tests and admin writes that change the numbers. */
export const clearAnalyticsCache = () => cache.clear()

function clientWhere(actor: Actor, q: AnalyticsQuery): Prisma.UserWhereInput {
  const consultantId = actor.role === 'CONSULTANT' ? actor.id : q.consultantId
  return { role: 'CLIENT', ...(consultantId ? { consultantId } : {}) }
}

function range(q: AnalyticsQuery) {
  const from = q.from ? new Date(`${q.from}T00:00:00.000Z`) : new Date(0)
  const to = q.to ? new Date(`${q.to}T23:59:59.999Z`) : new Date(8.64e15)
  return { gte: from, lte: to }
}

const tally = (values: string[], limit = 12): CountRow[] => {
  const m = new Map<string, number>()
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1)
  return [...m.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, limit)
}

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' ? [v] : [])

export async function overview(db: Db, actor: Actor, q: AnalyticsQuery): Promise<OverviewDto> {
  const { fresh, ...scope } = q
  return cached(`overview:${actor.id}:${JSON.stringify(scope)}`, async () => {
    const clients = clientWhere(actor, q)
    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    const events = { client: clients, deletedAt: null, status: { not: 'ARCHIVED' as const } }
    const clientIds = (await db.user.findMany({ where: clients, select: { id: true } })).map((c) => c.id)
    const [active, invited, accepted, newInquiries, moodboards, plans, openQuotes, upcoming, activity, todo] = await Promise.all([
      db.user.count({ where: { ...clients, status: 'ACTIVE', OR: [{ accessExpiresAt: null }, { accessExpiresAt: { gt: now } }] } }),
      db.user.count({ where: { ...clients, status: 'INVITED' } }),
      db.invite.count({ where: { acceptedAt: { gte: weekAgo }, userId: { in: clientIds } } }),
      db.inquiry.count({ where: { status: 'NEW' } }),
      db.moodboard.count({ where: { event: events, generator: { startsWith: 'rules' }, createdAt: range(q) } }),
      db.budgetPlan.findMany({ where: { event: events }, select: { targetPkr: true } }),
      db.quoteRequest.count({ where: { status: { in: ['OPEN', 'IN_REVIEW'] }, plan: { event: events } } }),
      db.event.findMany({
        where: { ...events, date: { gte: new Date(now.toISOString().slice(0, 10)), lte: in30 } },
        orderBy: { date: 'asc' },
        take: 10,
        include: { client: { select: { id: true, name: true } } },
      }),
      db.activityEntry.findMany({ where: { clientId: { in: clientIds } }, orderBy: { id: 'desc' }, take: 12 }),
      followUps(db, actor, 'week', now),
    ])
    const names = new Map((await db.user.findMany({ where: { id: { in: [...new Set(activity.map((a) => a.clientId))] }, deletedAt: {} }, select: { id: true, name: true } })).map((u) => [u.id, u.name]))
    const targets = plans.map((p) => p.targetPkr).filter((t) => t > 0)
    return {
      kpis: {
        activeClients: active,
        invitedClients: invited,
        consultationsThisWeek: accepted + (await db.inquiry.count({ where: { createdAt: { gte: weekAgo } } })),
        moodboardsGenerated: moodboards,
        averageTargetBudgetPkr: targets.length ? Math.round(targets.reduce((a, b) => a + b, 0) / targets.length) : null,
        openQuotes,
        newInquiries,
      },
      upcomingEvents: upcoming.map((e) => ({
        id: e.id,
        name: e.concept ?? e.name,
        type: eventTypeFromDb(e.type),
        date: e.date!.toISOString().slice(0, 10),
        clientId: e.client.id,
        clientName: e.client.name,
      })),
      followUps: todo.slice(0, 10),
      recentActivity: activity.map((a) => ({ id: a.id, clientId: a.clientId, clientName: names.get(a.clientId) ?? 'Client', kind: a.kind.toLowerCase(), title: a.title, at: a.createdAt.toISOString() })),
    }
  }, fresh === 'true')
}

export async function analytics(db: Db, actor: Actor, q: AnalyticsQuery): Promise<AnalyticsDto> {
  const { fresh, ...scope } = q
  return cached(`analytics:${actor.id}:${JSON.stringify(scope)}`, async () => {
    const clients = clientWhere(actor, q)
    // Themes, budgets and event types count events created in the period; the funnel
    // counts clients who joined in the period, through every stage they reached since.
    const events = { client: clients, deletedAt: null, createdAt: range(q) }
    const cohort = { client: { ...clients, createdAt: range(q) }, deletedAt: null }
    const [responses, cohortResponses, adopted, leads, plans, eventRows, invited, activated, saved, quoted, items] = await Promise.all([
      db.questionnaireResponse.findMany({ where: { event: events }, select: { answers: true } }),
      db.questionnaireResponse.findMany({ where: { event: cohort }, select: { percentComplete: true, submittedAt: true, event: { select: { clientId: true } } } }),
      db.moodboard.findMany({ where: { event: events, generator: 'inspiration', sourceInspirationId: { not: null } }, select: { sourceInspirationId: true } }),
      db.moodboard.findMany({ where: { event: events, isPrimary: true }, select: { controls: true } }),
      db.budgetPlan.findMany({ where: { event: events }, include: { lines: true } }),
      db.event.findMany({ where: events, select: { type: true, createdAt: true } }),
      db.user.count({ where: { ...clients, createdAt: range(q) } }),
      db.user.count({ where: { ...clients, createdAt: range(q), passwordHash: { not: null } } }),
      db.moodboard.findMany({ where: { event: cohort, status: 'SAVED' }, select: { event: { select: { clientId: true } } } }),
      db.quoteRequest.findMany({ where: { plan: { event: cohort } }, select: { plan: { select: { event: { select: { clientId: true } } } } } }),
      db.inventoryItem.findMany({
        select: {
          name: true,
          sku: true,
          _count: { select: { moodboardTiles: { where: { moodboard: { status: 'SAVED', event: events } } }, budgetLines: { where: { plan: { event: events } } } } },
        },
      }),
    ])

    const inspirationNames = new Map(
      (await db.inspiration.findMany({ where: { id: { in: adopted.map((m) => m.sourceInspirationId!) } }, select: { id: true, name: true } })).map((i) => [i.id, i.name]),
    )

    const answers = responses.map((r) => r.answers as Record<string, unknown>)
    const lights = plans.map((p) => classifyBudget(budgetTotals(p.lines).includedPkr, p.targetPkr).state)
    const targetBand = (t: number) =>
      t < 250_000 ? 'Under 2.5L' : t < 500_000 ? '2.5L–5L' : t < 1_000_000 ? '5L–10L' : t < 2_000_000 ? '10L–20L' : t < 5_000_000 ? '20L–50L' : '50L+'

    const months = new Map<string, number>()
    for (const e of eventRows) {
      const key = `${e.createdAt.toISOString().slice(0, 7)}|${eventTypeFromDb(e.type)}`
      months.set(key, (months.get(key) ?? 0) + 1)
    }
    // The funnel counts clients: each stage = clients who reached it on at least one event.
    const clientsWhere = (rows: { clientId: string }[]) => new Set(rows.map((r) => r.clientId)).size
    const halfway = clientsWhere(cohortResponses.filter((r) => r.percentComplete >= 50 || r.submittedAt).map((r) => r.event))
    const submitted = clientsWhere(cohortResponses.filter((r) => r.submittedAt).map((r) => r.event))

    return {
      themes: {
        aesthetics: tally(answers.flatMap((a) => asList(a.q10_aesthetic))),
        atmospheres: tally(answers.flatMap((a) => asList(a.q11_atmosphere))),
        adoptedInspirations: tally(adopted.map((m) => inspirationNames.get(m.sourceInspirationId!) ?? 'Removed concept')),
        leadMoods: tally(leads.map((m) => String((m.controls as { mood?: string } | null)?.mood ?? 'unset'))),
      },
      budgets: {
        bands: tally(answers.flatMap((a) => asList(a.q121_budget)), 10),
        targets: tally(plans.filter((p) => p.targetPkr > 0).map((p) => targetBand(p.targetPkr)), 10),
        lights: tally(lights),
      },
      eventTypes: [...months.entries()].map(([key, value]) => {
        const [month, type] = key.split('|')
        return { month, type, value }
      }).sort((a, b) => a.month.localeCompare(b.month) || b.value - a.value),
      funnel: [
        { label: 'Invited', value: invited },
        { label: 'Activated', value: activated },
        { label: 'Questionnaire half done', value: halfway },
        { label: 'Questionnaire submitted', value: submitted },
        { label: 'Moodboard saved', value: clientsWhere(saved.map((m) => m.event)) },
        { label: 'Quote requested', value: clientsWhere(quoted.map((q) => q.plan.event)) },
      ],
      inventory: items
        .map((i) => ({ label: i.name, sku: i.sku, moodboards: i._count.moodboardTiles, budgets: i._count.budgetLines }))
        .filter((i) => i.moodboards + i.budgets > 0)
        .sort((a, b) => b.moodboards + b.budgets - (a.moodboards + a.budgets))
        .slice(0, 20),
    }
  }, fresh === 'true')
}

/** One report as CSV (header row + data rows). */
export function reportCsv(data: AnalyticsDto, report: string): string {
  const esc = (v: unknown) => {
    const s = String(v ?? '')
    // Spreadsheet formula injection guard + quoting.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
  }
  const rows: unknown[][] = []
  if (report === 'themes') {
    rows.push(['group', 'label', 'count'])
    for (const [group, list] of Object.entries(data.themes)) for (const r of list) rows.push([group, r.label, r.value])
  } else if (report === 'budgets') {
    rows.push(['group', 'label', 'count'])
    for (const [group, list] of Object.entries(data.budgets)) for (const r of list) rows.push([group, r.label, r.value])
  } else if (report === 'event-types') {
    rows.push(['month', 'type', 'events'])
    for (const r of data.eventTypes) rows.push([r.month, r.type, r.value])
  } else if (report === 'funnel') {
    rows.push(['stage', 'count'])
    for (const r of data.funnel) rows.push([r.label, r.value])
  } else {
    rows.push(['item', 'sku', 'saved moodboards', 'budget lines'])
    for (const r of data.inventory) rows.push([r.label, r.sku, r.moodboards, r.budgets])
  }
  return rows.map((r) => r.map(esc).join(',')).join('\n') + '\n'
}
