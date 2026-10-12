import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp } from '../../test/app'
import { resetDb } from '../../test/db'
import { createUser, TEST_PASSWORD } from '../../test/users'
import { SESSION_COOKIE } from '../auth/sessions'
import { importInventoryCsv } from '../inventory/service'

type TestApp = Awaited<ReturnType<typeof buildTestApp>>
let app: TestApp

const catalogue = readFileSync(fileURLToPath(new URL('../../../prisma/seed/inventory-draft.csv', import.meta.url)), 'utf8')

beforeAll(async () => {
  app = await buildTestApp()
})
afterAll(async () => {
  await app.close()
})
beforeEach(async () => {
  await resetDb(app.prisma)
  await importInventoryCsv(app.prisma, null, catalogue, { commit: true })
  // The draft catalogue is unpriced (P22): price everything except backdrops for these tests.
  await app.prisma.inventoryItem.updateMany({ where: { category: { not: 'BACKDROP' } }, data: { pricePkr: 5_000 } })
})

async function signIn(email: string) {
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password: TEST_PASSWORD } })
  return { [SESSION_COOKIE]: res.cookies.find((c) => c.name === SESSION_COOKIE)!.value }
}

async function setup(answers: Record<string, unknown> = {}) {
  const consultant = await createUser(app.prisma, { role: 'CONSULTANT', name: 'Ayesha Malik' })
  const client = await createUser(app.prisma, { consultantId: consultant.id })
  const asClient = await signIn(client.email)
  const event = (
    await app.inject({
      method: 'POST',
      url: '/api/v1/events',
      cookies: asClient,
      payload: { type: 'Walima', concept: 'Moonlit Walima', date: '2027-03-14', guests: 320, venueName: 'Marquee', city: 'Lahore', venueSetting: 'Indoor' },
    })
  ).json()
  if (Object.keys(answers).length) {
    await app.inject({ method: 'PATCH', url: `/api/v1/events/${event.id}/questionnaire`, cookies: asClient, payload: { version: 1, set: answers } })
  }
  return { asClient, consultant, eventId: event.id as string }
}

const api = (method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, cookies: Record<string, string>, payload?: object) =>
  app.inject({ method, url: `/api/v1${url}`, cookies, ...(payload && { payload }) })

const linesOf = (plan: { lines: { id: string; item: { id: string }; category: string; qty: number; included: boolean }[] }) =>
  plan.lines.map((l) => ({ id: l.id, inventoryItemId: l.item.id, category: l.category, qty: l.qty, included: l.included }))

describe('starting a budget', () => {
  it('lists every event, with or without a plan, and suggests a target', async () => {
    const { asClient, eventId } = await setup({ q121_budget: 'PKR 2M–5M' })
    const list = (await api('GET', '/budgets', asClient)).json()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ event: { id: eventId }, plan: null })

    const res = (await api('GET', `/events/${eventId}/budget`, asClient)).json()
    expect(res).toMatchObject({ plan: null, suggestedTargetPkr: 3_500_000, hasMoodboard: false })
  })

  it("seeds from Elation's recommendation: seats and tables for every guest, target written through", async () => {
    const { asClient, eventId } = await setup({ q9_areas: ['Main Stage', 'Dining', 'Entrance'] })
    const res = await api('POST', `/events/${eventId}/budget`, asClient, { seedFrom: 'rules', targetPkr: 4_000_000 })
    expect(res.statusCode).toBe(201)
    const { plan } = res.json()
    expect(plan).toMatchObject({ seededFrom: 'rules', status: 'draft', targetPkr: 4_000_000, version: 1 })
    expect(plan.lines.find((l: { item: { category: string } }) => l.item.category === 'Chair')?.qty).toBe(320)
    expect(plan.lines.find((l: { item: { category: string } }) => l.item.category === 'Table')?.qty).toBe(32)
    expect(plan.lines.every((l: { unitPricePkr: number }) => l.unitPricePkr === 5_000)).toBe(true)
    expect(plan.totals.includedPkr).toBe(plan.lines.reduce((s: number, l: { qty: number }) => s + l.qty * 5_000, 0))

    const event = (await api('GET', `/events/${eventId}`, asClient)).json()
    expect(event).toMatchObject({ budgetPKR: 4_000_000, progress: { budget: 'in_progress' } })
    expect((await api('POST', `/events/${eventId}/budget`, asClient, { seedFrom: 'blank' })).statusCode).toBe(409)
  })

  it('seeds from the moodboard and reports pieces that are priced on request', async () => {
    const { asClient, eventId } = await setup({ q9_areas: ['Main Stage', 'Entrance'] })
    await api('POST', `/events/${eventId}/moodboards/generate`, asClient, {})
    const res = (await api('POST', `/events/${eventId}/budget`, asClient, { seedFrom: 'moodboard' })).json()
    expect(res.plan.seededFrom).toBe('moodboard')
    expect(res.plan.lines.length).toBeGreaterThan(0)
    expect(res.plan.lines.some((l: { item: { category: string } }) => l.item.category === 'Backdrop')).toBe(false)
    expect(res.unpricedItems.length).toBeGreaterThan(0) // backdrops are unpriced in this test
  })
})

describe('editing', () => {
  async function withPlan() {
    const ctx = await setup()
    const { plan } = (await api('POST', `/events/${ctx.eventId}/budget`, ctx.asClient, { seedFrom: 'rules', targetPkr: 2_000_000 })).json()
    return { ...ctx, plan }
  }

  it('replaces lines with a version check and keeps price snapshots', async () => {
    const { asClient, eventId, plan } = await withPlan()
    const [first, ...rest] = linesOf(plan)
    await app.prisma.inventoryItem.update({ where: { id: first.inventoryItemId }, data: { pricePkr: 9_000 } })

    const saved = await api('PUT', `/events/${eventId}/budget`, asClient, {
      version: 1,
      targetPkr: 2_200_000,
      lines: [{ ...first, qty: 3, included: false }, ...rest],
    })
    expect(saved.statusCode).toBe(200)
    const next = saved.json()
    expect(next.version).toBe(2)
    expect(next.lines[0]).toMatchObject({ qty: 3, included: false, unitPricePkr: 5_000, currentPricePkr: 9_000 })
    expect(next.pricesChanged).toBe(true)

    const stale = await api('PUT', `/events/${eventId}/budget`, asClient, { version: 1, targetPkr: 1, lines: [] })
    expect(stale.statusCode).toBe(409)
    expect(stale.json().error.code).toBe('VERSION_CONFLICT')

    const repriced = (await api('POST', `/events/${eventId}/budget/reprice`, asClient)).json()
    expect(repriced.lines[0].unitPricePkr).toBe(9_000)
    expect(repriced.pricesChanged).toBe(false)
  })

  it('refuses unpriced pieces, 422', async () => {
    const { asClient, eventId, plan } = await withPlan()
    const backdrop = await app.prisma.inventoryItem.findFirstOrThrow({ where: { category: 'BACKDROP' } })
    const put = await api('PUT', `/events/${eventId}/budget`, asClient, {
      version: plan.version,
      targetPkr: plan.targetPkr,
      lines: [...linesOf(plan), { inventoryItemId: backdrop.id, category: 'Stage', qty: 1, included: true }],
    })
    expect(put.statusCode).toBe(422)
    expect(put.json().error.code).toBe('ITEM_UNPRICED')
    const add = await api('POST', `/events/${eventId}/budget/lines`, asClient, { inventoryItemId: backdrop.id })
    expect(add.statusCode).toBe(422)
  })

  it('keeps the target and the event budget in step, both ways', async () => {
    const { asClient, eventId, plan } = await withPlan()
    await api('PUT', `/events/${eventId}/budget`, asClient, { version: plan.version, targetPkr: 3_000_000, lines: linesOf(plan) })
    expect((await api('GET', `/events/${eventId}`, asClient)).json().budgetPKR).toBe(3_000_000)

    await api('PATCH', `/events/${eventId}`, asClient, { budgetPkr: 1_800_000 })
    expect((await api('GET', `/events/${eventId}/budget`, asClient)).json().plan.targetPkr).toBe(1_800_000)

    // An estimator still holding the old version can't write its old target back.
    const stale = await api('PUT', `/events/${eventId}/budget`, asClient, { version: plan.version + 1, targetPkr: 3_000_000, lines: linesOf(plan) })
    expect(stale.statusCode).toBe(409)
  })

  it('rejects the same piece twice in one save', async () => {
    const { asClient, eventId, plan } = await withPlan()
    const [first] = linesOf(plan)
    const res = await api('PUT', `/events/${eventId}/budget`, asClient, {
      version: plan.version,
      targetPkr: plan.targetPkr,
      lines: [first, { ...first, id: undefined }],
    })
    expect(res.statusCode).toBe(400)
  })

  it('"Add to budget" creates the plan when needed and ignores a piece already in it', async () => {
    const { asClient, eventId } = await setup()
    const chair = await app.prisma.inventoryItem.findFirstOrThrow({ where: { category: 'CHAIR' } })
    const first = (await api('POST', `/events/${eventId}/budget/lines`, asClient, { inventoryItemId: chair.id, area: 'dining', source: 'moodboard' })).json()
    expect(first).toMatchObject({ seededFrom: 'blank', lines: [{ category: 'Seating', qty: 320, source: 'moodboard' }] })
    const again = (await api('POST', `/events/${eventId}/budget/lines`, asClient, { inventoryItemId: chair.id })).json()
    expect(again.lines).toHaveLength(1)
  })

  it('applies a moodboard: only pieces not already in the plan', async () => {
    const { asClient, eventId } = await setup({ q9_areas: ['Main Stage', 'Dining'] })
    const { concepts } = (await api('POST', `/events/${eventId}/moodboards/generate`, asClient, {})).json()
    const first = (await api('POST', `/moodboards/${concepts[0].id}/apply-to-budget`, asClient)).json()
    expect(first.added).toBeGreaterThan(0)
    const again = (await api('POST', `/moodboards/${concepts[0].id}/apply-to-budget`, asClient)).json()
    expect(again.added).toBe(0)
    expect(again.plan.lines).toHaveLength(first.plan.lines.length)
  })

  it('reset re-seeds the way the plan started', async () => {
    const { asClient, eventId, plan } = await withPlan()
    await api('PUT', `/events/${eventId}/budget`, asClient, { version: plan.version, targetPkr: plan.targetPkr, lines: [] })
    const reset = (await api('POST', `/events/${eventId}/budget/reset`, asClient)).json()
    expect(reset.lines).toHaveLength(plan.lines.length)
    expect(reset.targetPkr).toBe(plan.targetPkr)
  })
})

describe('hand-offs', () => {
  it('quote request freezes the plan once, tells the consultant, and flags later edits', async () => {
    const { asClient, consultant, eventId } = await setup()
    const { plan } = (await api('POST', `/events/${eventId}/budget`, asClient, { seedFrom: 'rules' })).json()

    const quote = await api('POST', `/events/${eventId}/budget/quote`, asClient, { note: 'Can we do peonies?' })
    expect(quote.statusCode).toBe(201)
    const repeat = await api('POST', `/events/${eventId}/budget/quote`, asClient, { note: 'Can we do peonies?' })
    expect(repeat.statusCode).toBe(200)
    expect(repeat.json().id).toBe(quote.json().id)
    expect(quote.json()).toMatchObject({ status: 'open', totalPkr: plan.totals.includedPkr, note: 'Can we do peonies?' })
    expect(app.sentMail.last(consultant.email)?.subject).toMatch(/requested a quote/)

    const after = (await api('GET', `/events/${eventId}/budget`, asClient)).json().plan
    expect(after).toMatchObject({ status: 'submitted', changedSinceQuote: false })
    expect((await api('GET', `/events/${eventId}`, asClient)).json().progress.budget).toBe('complete')

    const edited = (await api('PUT', `/events/${eventId}/budget`, asClient, { version: after.version, targetPkr: after.targetPkr, lines: linesOf(after).slice(1) })).json()
    expect(edited.changedSinceQuote).toBe(true)
    expect((await api('GET', `/events/${eventId}/budget/quotes`, asClient)).json()).toHaveLength(1)
  })

  it("send to consultant names the client's own consultant", async () => {
    const { asClient, eventId } = await setup()
    await api('POST', `/events/${eventId}/budget`, asClient, { seedFrom: 'rules' })
    const res = (await api('POST', `/events/${eventId}/budget/send-to-consultant`, asClient, {})).json()
    expect(res.consultantName).toBe('Ayesha Malik')
  })

  it("hides other clients' budgets", async () => {
    const { asClient, eventId } = await setup()
    await api('POST', `/events/${eventId}/budget`, asClient, { seedFrom: 'blank' })
    const stranger = await signIn((await createUser(app.prisma)).email)
    expect((await api('GET', `/events/${eventId}/budget`, stranger)).statusCode).toBe(404)
    expect((await api('PUT', `/events/${eventId}/budget`, stranger, { version: 1, targetPkr: 1, lines: [] })).statusCode).toBe(404)
    expect((await api('GET', '/budgets', stranger)).json()).toEqual([])
  })
})
