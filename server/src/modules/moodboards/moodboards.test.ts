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
})

async function signIn(email: string) {
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password: TEST_PASSWORD } })
  return { [SESSION_COOKIE]: res.cookies.find((c) => c.name === SESSION_COOKIE)!.value }
}

async function setup(answers: Record<string, unknown> = {}) {
  const consultant = await createUser(app.prisma, { role: 'CONSULTANT' })
  const client = await createUser(app.prisma, { consultantId: consultant.id })
  const asClient = await signIn(client.email)
  const event = (
    await app.inject({
      method: 'POST',
      url: '/api/v1/events',
      cookies: asClient,
      payload: { type: 'Mehndi', concept: 'Whispers of Noor', date: '2027-03-14', guests: 300, venueName: 'Hilltop', city: 'Islamabad', venueSetting: 'Outdoor' },
    })
  ).json()
  if (Object.keys(answers).length) {
    await app.inject({ method: 'PATCH', url: `/api/v1/events/${event.id}/questionnaire`, cookies: asClient, payload: { version: 1, set: answers } })
  }
  return { asClient, asConsultant: await signIn(consultant.email), eventId: event.id as string }
}

const generate = (eventId: string, cookies: Record<string, string>, body: object = {}, headers: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url: `/api/v1/events/${eventId}/moodboards/generate`, cookies, payload: body, headers })

describe('generate', () => {
  it('curates three inventory-backed draft concepts from the questionnaire', async () => {
    const { asClient, eventId } = await setup({
      q9_areas: ['Entrance', 'Main Stage', 'Dining', 'Ceiling'],
      q10_aesthetic: ['Romantic', 'Soft'],
      q16_colours: { desc: 'Blush and ivory', hex: ['#E3BFB9', '#F5EFD9'] },
    })
    const defaults = (await app.inject({ method: 'GET', url: `/api/v1/events/${eventId}/moodboards/defaults`, cookies: asClient })).json()
    expect(defaults).toMatchObject({ fromQuestionnaire: true, controls: { mood: 'romantic', palette: ['#E3BFB9', '#F5EFD9'], venue: 'Hilltop Outdoor' } })

    const res = await generate(eventId, asClient)
    expect(res.statusCode).toBe(201)
    const { concepts } = res.json()
    expect(concepts.map((c: { variantLabel: string }) => c.variantLabel)).toEqual(['A', 'B', 'C'])
    for (const c of concepts) {
      expect(c.status).toBe('draft')
      expect(c.tileItems.length).toBeGreaterThanOrEqual(6)
      expect(c.tileItems.every((t: { item: { id: string } | null; reasons: string[] }) => t.item && t.reasons.length)).toBe(true)
      expect(c.tiles[0]).toMatch(/^\/media\/inventory\//)
    }

    const activity = await app.prisma.activityEntry.findFirst({ where: { eventId, kind: 'MOODBOARD' } })
    expect(activity?.title).toBe('Elation curated 3 new concepts')
  })

  it('honours "one mood board" (Q132) and "no florals"', async () => {
    const { asClient, eventId } = await setup({ q132_deliverables: 'One Mood Board', q76_florals: 'No' })
    const { concepts } = (await generate(eventId, asClient)).json()
    expect(concepts).toHaveLength(1)
    expect(concepts[0].tileItems.some((t: { item: { category: string } }) => t.item.category === 'Floral')).toBe(false)
  })

  it('returns the same generation for a repeated Idempotency-Key', async () => {
    const { asClient, eventId } = await setup()
    const a = (await generate(eventId, asClient, {}, { 'idempotency-key': 'click-1' })).json()
    const b = (await generate(eventId, asClient, {}, { 'idempotency-key': 'click-1' })).json()
    expect(b.generationId).toBe(a.generationId)
    expect(await app.prisma.moodboard.count({ where: { eventId } })).toBe(3)
  })

  it('validates controls', async () => {
    const { asClient, eventId } = await setup()
    const res = await generate(eventId, asClient, { controls: { mood: 'angry', style: 'garden', palette: [], density: 'Heavy', venue: 'Garden', venueLocked: true } })
    expect(res.statusCode).toBe(400)
  })

  it('submitting the questionnaire produces the first concepts', async () => {
    const { asClient, eventId } = await setup({ q22_entrance: 'Yes', q29_stage: 'Yes', q121_budget: 'PKR 1M–2M', q130_control: 'Elation can take the lead' })
    const submit = await app.inject({ method: 'POST', url: `/api/v1/events/${eventId}/questionnaire/submit`, cookies: asClient })
    expect(submit.statusCode).toBe(200)
    const boards = (await app.inject({ method: 'GET', url: `/api/v1/events/${eventId}/moodboards`, cookies: asClient })).json()
    expect(boards).toHaveLength(3)
    const event = (await app.inject({ method: 'GET', url: `/api/v1/events/${eventId}`, cookies: asClient })).json()
    expect(event.progress.moodboard).toBe('in_progress')
  })
})

describe('concept actions', () => {
  async function withConcepts() {
    const ctx = await setup()
    const { concepts } = (await generate(ctx.eventId, ctx.asClient)).json()
    return { ...ctx, concepts }
  }

  it('save makes the first saved concept primary; the event moodboard step completes', async () => {
    const { asClient, eventId, concepts } = await withConcepts()
    const saved = (await app.inject({ method: 'POST', url: `/api/v1/moodboards/${concepts[1].id}/save`, cookies: asClient })).json()
    expect(saved).toMatchObject({ status: 'saved', isPrimary: true })

    const event = (await app.inject({ method: 'GET', url: `/api/v1/events/${eventId}`, cookies: asClient })).json()
    expect(event.progress.moodboard).toBe('complete')

    const other = (await app.inject({ method: 'POST', url: `/api/v1/moodboards/${concepts[2].id}/primary`, cookies: asClient })).json()
    expect(other.isPrimary).toBe(true)
    expect(await app.prisma.moodboard.count({ where: { eventId, isPrimary: true } })).toBe(1)

    const library = (await app.inject({ method: 'GET', url: '/api/v1/moodboards', cookies: asClient })).json()
    expect(library.map((m: { id: string }) => m.id).sort()).toEqual([concepts[1].id, concepts[2].id].sort())
  })

  it('likes, renames, duplicates and archives', async () => {
    const { asClient, concepts } = await withConcepts()
    const id = concepts[0].id
    const liked = (await app.inject({ method: 'PATCH', url: `/api/v1/moodboards/${id}`, cookies: asClient, payload: { liked: true, title: 'Moonlit' } })).json()
    expect(liked).toMatchObject({ liked: true, title: 'Moonlit' })

    const copy = await app.inject({ method: 'POST', url: `/api/v1/moodboards/${id}/duplicate`, cookies: asClient })
    expect(copy.statusCode).toBe(201)
    expect(copy.json()).toMatchObject({ title: 'Moonlit · Copy', status: 'saved', isPrimary: false })
    expect(copy.json().tileItems).toHaveLength(concepts[0].tileItems.length)

    expect((await app.inject({ method: 'DELETE', url: `/api/v1/moodboards/${copy.json().id}`, cookies: asClient })).statusCode).toBe(204)
    const library = (await app.inject({ method: 'GET', url: '/api/v1/moodboards?status=all', cookies: asClient })).json()
    expect(library.some((m: { id: string }) => m.id === copy.json().id)).toBe(false)
  })

  it('reorders, locks, swaps from alternatives, and keeps locks on regenerate', async () => {
    const { asClient, eventId, concepts } = await withConcepts()
    const board = concepts[0]
    const ids = board.tileItems.map((t: { id: string }) => t.id)

    const reordered = (await app.inject({ method: 'PUT', url: `/api/v1/moodboards/${board.id}/tiles/order`, cookies: asClient, payload: { tileIds: [...ids].reverse() } })).json()
    expect(reordered.tileItems[0].id).toBe(ids.at(-1))
    const bad = await app.inject({ method: 'PUT', url: `/api/v1/moodboards/${board.id}/tiles/order`, cookies: asClient, payload: { tileIds: ids.slice(1) } })
    expect(bad.statusCode).toBe(400)

    const first = reordered.tileItems[0]
    const alts = (await app.inject({ method: 'GET', url: `/api/v1/moodboards/${board.id}/tiles/${first.id}/alternatives`, cookies: asClient })).json()
    expect(alts.length).toBeGreaterThan(0)
    expect(alts.every((a: { item: { id: string; category: string } }) => a.item.id !== first.item.id && a.item.category === first.item.category)).toBe(true)

    const swapped = (await app.inject({ method: 'PATCH', url: `/api/v1/moodboards/${board.id}/tiles/${first.id}`, cookies: asClient, payload: { inventoryItemId: alts[0].item.id, locked: true } })).json()
    expect(swapped.tileItems[0]).toMatchObject({ locked: true, reasons: ['your choice'], item: { id: alts[0].item.id } })

    const next = (await generate(eventId, asClient, { keepLockedFrom: board.id })).json()
    for (const c of next.concepts) {
      expect(c.tileItems.find((t: { item: { id: string } }) => t.item.id === alts[0].item.id)?.locked).toBe(true)
    }
  })

  it('refuses swaps that break the brief or change the kind of piece', async () => {
    const { asClient, eventId, concepts } = await withConcepts()
    await app.inject({ method: 'PATCH', url: `/api/v1/events/${eventId}/questionnaire`, cookies: asClient, payload: { version: 1, set: { q76_florals: 'No' } } })
    const board = concepts[0]
    const tile = board.tileItems.find((t: { item: { category: string } }) => t.item.category !== 'Floral')
    const floral = await app.prisma.inventoryItem.findFirst({ where: { category: 'FLORAL', active: true } })
    const other = await app.prisma.inventoryItem.findFirst({ where: { category: { notIn: ['FLORAL', tile.item.category.toUpperCase()] }, active: true } })
    for (const item of [floral!, other!]) {
      const res = await app.inject({ method: 'PATCH', url: `/api/v1/moodboards/${board.id}/tiles/${tile.id}`, cookies: asClient, payload: { inventoryItemId: item.id } })
      expect(res.statusCode).toBe(422)
      expect(res.json().error.code).toBe('SWAP_NOT_ALLOWED')
    }
  })

  it('removing the lead concept hands the lead to the newest saved one; regenerating retires old drafts', async () => {
    const { asClient, eventId, concepts } = await withConcepts()
    await app.inject({ method: 'POST', url: `/api/v1/moodboards/${concepts[0].id}/save`, cookies: asClient })
    await app.inject({ method: 'POST', url: `/api/v1/moodboards/${concepts[1].id}/save`, cookies: asClient })
    await app.inject({ method: 'DELETE', url: `/api/v1/moodboards/${concepts[0].id}`, cookies: asClient })
    expect((await app.prisma.moodboard.findUniqueOrThrow({ where: { id: concepts[1].id } })).isPrimary).toBe(true)

    await generate(eventId, asClient)
    expect((await app.prisma.moodboard.findUniqueOrThrow({ where: { id: concepts[2].id } })).status).toBe('ARCHIVED')
    expect((await app.prisma.moodboard.findUniqueOrThrow({ where: { id: concepts[1].id } })).status).toBe('SAVED')
  })

  it('records "ask my consultant" for the Elation team', async () => {
    const { asClient, eventId, concepts } = await withConcepts()
    const tile = concepts[0].tileItems[0]
    const res = await app.inject({ method: 'POST', url: `/api/v1/moodboards/${concepts[0].id}/tiles/${tile.id}/consult`, cookies: asClient, payload: { note: 'Something taller?' } })
    expect(res.statusCode).toBe(202)
    const entry = await app.prisma.activityEntry.findFirst({ where: { eventId, title: { startsWith: 'Asked Elation' } } })
    expect(entry).toMatchObject({ detail: 'Something taller?' })
  })

  it('hides other clients’ moodboards and hides stock numbers from clients', async () => {
    const { asConsultant, concepts } = await withConcepts()
    const stranger = await createUser(app.prisma)
    const res = await app.inject({ method: 'GET', url: `/api/v1/moodboards/${concepts[0].id}`, cookies: await signIn(stranger.email) })
    expect(res.statusCode).toBe(404)

    expect(concepts[0].tileItems[0].item).not.toHaveProperty('stockQty')
    expect(concepts[0].tileItems.every((t: { score: number | null }) => t.score === null)).toBe(true)
    const asStaff = (await app.inject({ method: 'GET', url: `/api/v1/moodboards/${concepts[0].id}`, cookies: asConsultant })).json()
    expect(asStaff.tileItems[0].item).toHaveProperty('stockQty')
  })
})
