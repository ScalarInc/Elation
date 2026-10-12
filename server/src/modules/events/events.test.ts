import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { seed } from '../../../prisma/seed/seed'
import { buildTestApp } from '../../test/app'
import { resetDb } from '../../test/db'
import { createUser, TEST_PASSWORD } from '../../test/users'
import { SESSION_COOKIE } from '../auth/sessions'

type TestApp = Awaited<ReturnType<typeof buildTestApp>>
let app: TestApp

beforeAll(async () => {
  app = await buildTestApp()
})
afterAll(async () => {
  await app.close()
})
beforeEach(async () => {
  await resetDb(app.prisma)
})

async function signIn(email: string, password = TEST_PASSWORD) {
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } })
  expect(res.statusCode).toBe(200)
  return { [SESSION_COOKIE]: res.cookies.find((c) => c.name === SESSION_COOKIE)!.value }
}

const newEvent = {
  type: 'Mehndi',
  concept: 'Whispers of Noor',
  date: '2027-03-14',
  guests: 320,
  venueName: 'Hilltop Grounds',
  city: 'Islamabad',
  venueSetting: 'Outdoor',
} as const

async function setup() {
  const consultant = await createUser(app.prisma, { role: 'CONSULTANT' })
  const client = await createUser(app.prisma, { consultantId: consultant.id })
  const other = await createUser(app.prisma)
  return {
    consultant,
    client,
    other,
    asClient: await signIn(client.email),
    asOther: await signIn(other.email),
    asConsultant: await signIn(consultant.email),
  }
}

describe('create + read', () => {
  it('creates a draft event with the questionnaire basics already answered', async () => {
    const { asClient } = await setup()
    const res = await app.inject({ method: 'POST', url: '/api/v1/events', cookies: asClient, payload: newEvent })
    expect(res.statusCode).toBe(201)
    const event = res.json()
    expect(event).toMatchObject({
      name: 'Whispers of Noor',
      type: 'Mehndi',
      date: '2027-03-14',
      venue: { name: 'Hilltop Grounds', city: 'Islamabad', indoor: 'Outdoor' },
      guests: 320,
      budgetPKR: null,
      status: 'draft',
      coverImage: '/media/img_18.jpg',
      progress: { questionnaire: 'in_progress', moodboard: 'pending', budget: 'pending', ar: 'pending' },
      nextStep: { href: `/events/${event.id}/questionnaire` },
    })
    expect(event.questionnairePercent).toBeGreaterThan(0)

    const q = await app.prisma.questionnaireResponse.findUniqueOrThrow({ where: { eventId: event.id } })
    expect(q.answers).toMatchObject({
      q1_type: 'Mehndi',
      q2_name: 'Whispers of Noor',
      q3_date: '2027-03-14',
      q4_guests: 320,
      q5_venue: 'Hilltop Grounds',
      q6_indoor: 'Outdoor',
    })
    expect(await app.prisma.activityEntry.count({ where: { eventId: event.id, kind: 'EVENT' } })).toBe(1)

    const list = await app.inject({ method: 'GET', url: '/api/v1/events', cookies: asClient })
    expect(list.json().map((e: { id: string }) => e.id)).toEqual([event.id])
  })

  it('validates input', async () => {
    const { asClient } = await setup()
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/events',
      cookies: asClient,
      payload: { ...newEvent, date: '14/03/2027', guests: 0 },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('VALIDATION_FAILED')
  })

  it('requires sign-in', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/events' })).statusCode).toBe(401)
  })
})

describe('scoping', () => {
  it('hides other clients’ events (404, not 403)', async () => {
    const { asClient, asOther } = await setup()
    const event = (await app.inject({ method: 'POST', url: '/api/v1/events', cookies: asClient, payload: newEvent })).json()

    expect((await app.inject({ method: 'GET', url: `/api/v1/events/${event.id}`, cookies: asOther })).statusCode).toBe(404)
    expect((await app.inject({ method: 'GET', url: '/api/v1/events', cookies: asOther })).json()).toEqual([])
    const patch = await app.inject({ method: 'PATCH', url: `/api/v1/events/${event.id}`, cookies: asOther, payload: { guests: 1 } })
    expect(patch.statusCode).toBe(404)
  })

  it('lets the assigned consultant list and create events for their client', async () => {
    const { client, other, asConsultant } = await setup()

    const missingClient = await app.inject({ method: 'POST', url: '/api/v1/events', cookies: asConsultant, payload: newEvent })
    expect(missingClient.statusCode).toBe(422)

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/events',
      cookies: asConsultant,
      payload: { ...newEvent, clientId: client.id },
    })
    expect(created.statusCode).toBe(201)
    expect(created.json().clientId).toBe(client.id)

    const list = await app.inject({ method: 'GET', url: `/api/v1/events?clientId=${client.id}`, cookies: asConsultant })
    expect(list.json()).toHaveLength(1)

    const notMine = await app.inject({ method: 'GET', url: `/api/v1/events?clientId=${other.id}`, cookies: asConsultant })
    expect(notMine.statusCode).toBe(404)
  })
})

describe('update writes through to the questionnaire', () => {
  it('changing guests and venue updates the matching answers and records a revision', async () => {
    const { asClient } = await setup()
    const event = (await app.inject({ method: 'POST', url: '/api/v1/events', cookies: asClient, payload: newEvent })).json()

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/events/${event.id}`,
      cookies: asClient,
      payload: { guests: 450, venueSetting: 'Both', budgetPkr: 3_000_000 },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ guests: 450, venue: { indoor: 'Both' }, budgetPKR: 3_000_000 })

    const q = await app.prisma.questionnaireResponse.findUniqueOrThrow({
      where: { eventId: event.id },
      include: { revisions: { orderBy: { createdAt: 'asc' } } },
    })
    expect(q.answers).toMatchObject({ q4_guests: 450, q6_indoor: 'Both' })
    expect(q.version).toBe(2)
    expect(q.revisions.at(-1)!.changes).toEqual([
      { qid: 'q4_guests', from: 320, to: 450 },
      { qid: 'q6_indoor', from: 'Outdoor', to: 'Both' },
    ])
  })
})

describe('duplicate / archive / delete', () => {
  it('duplicates basics and answers but not the budget', async () => {
    const { asClient } = await setup()
    const event = (await app.inject({ method: 'POST', url: '/api/v1/events', cookies: asClient, payload: newEvent })).json()
    const item = await app.prisma.inventoryItem.create({
      data: { sku: 'X', name: 'Sofa', category: 'SOFA', colour: 'Ivory', pricePkr: 1, unit: 'EACH' },
    })
    await app.prisma.budgetPlan.create({
      data: {
        eventId: event.id,
        targetPkr: 1,
        seededFrom: 'blank',
        lines: { create: [{ category: 'Stage', inventoryItemId: item.id, qty: 1, unitPricePkr: 1, position: 0, source: 'client' }] },
      },
    })

    const copy = await app.inject({ method: 'POST', url: `/api/v1/events/${event.id}/duplicate`, cookies: asClient })
    expect(copy.statusCode).toBe(201)
    expect(copy.json()).toMatchObject({ name: 'Whispers of Noor (copy)', status: 'draft', guests: 320 })
    expect(copy.json().progress.budget).toBe('pending')
    const answers = (await app.prisma.questionnaireResponse.findUniqueOrThrow({ where: { eventId: copy.json().id } })).answers
    expect(answers).toMatchObject({ q2_name: 'Whispers of Noor (copy)', q4_guests: 320 })
  })

  it('archived events leave the default list and come back when unarchived', async () => {
    const { asClient } = await setup()
    const event = (await app.inject({ method: 'POST', url: '/api/v1/events', cookies: asClient, payload: newEvent })).json()

    const archived = await app.inject({ method: 'POST', url: `/api/v1/events/${event.id}/archive`, cookies: asClient })
    expect(archived.json().status).toBe('archived')
    expect((await app.inject({ method: 'GET', url: '/api/v1/events', cookies: asClient })).json()).toHaveLength(0)
    expect((await app.inject({ method: 'GET', url: '/api/v1/events?status=archived', cookies: asClient })).json()).toHaveLength(1)

    const patch = await app.inject({ method: 'PATCH', url: `/api/v1/events/${event.id}`, cookies: asClient, payload: { guests: 5 } })
    expect(patch.json().error.code).toBe('EVENT_ARCHIVED')

    const back = await app.inject({ method: 'POST', url: `/api/v1/events/${event.id}/unarchive`, cookies: asClient })
    expect(back.json().status).toBe('active')
  })

  it('deletes drafts only', async () => {
    const { asClient } = await setup()
    const draft = (await app.inject({ method: 'POST', url: '/api/v1/events', cookies: asClient, payload: newEvent })).json()
    const del = await app.inject({ method: 'DELETE', url: `/api/v1/events/${draft.id}`, cookies: asClient })
    expect(del.statusCode).toBe(204)
    expect((await app.inject({ method: 'GET', url: `/api/v1/events/${draft.id}`, cookies: asClient })).statusCode).toBe(404)

    const active = (await app.inject({ method: 'POST', url: '/api/v1/events', cookies: asClient, payload: newEvent })).json()
    await app.prisma.event.update({ where: { id: active.id }, data: { status: 'ACTIVE' } })
    const refused = await app.inject({ method: 'DELETE', url: `/api/v1/events/${active.id}`, cookies: asClient })
    expect(refused.statusCode).toBe(422)
    expect(refused.json().error.code).toBe('EVENT_NOT_DELETABLE')
  })

  it('reports events whose date has passed as past', async () => {
    const { asClient } = await setup()
    const old = await app.inject({
      method: 'POST',
      url: '/api/v1/events',
      cookies: asClient,
      payload: { ...newEvent, date: '2024-01-01' },
    })
    expect(old.json().status).toBe('past')
    expect((await app.inject({ method: 'GET', url: '/api/v1/events?status=past', cookies: asClient })).json()).toHaveLength(1)
  })
})

describe('seeded demo data', () => {
  it('serves Malaika’s four events with progress computed from real rows', async () => {
    await seed(app.prisma)
    const cookies = await signIn('malaika.khan@example.com', 'elation-dev')
    const res = await app.inject({ method: 'GET', url: '/api/v1/events', cookies })
    const byName = Object.fromEntries(res.json().map((e: { name: string }) => [e.name, e]))

    expect(Object.keys(byName).sort()).toEqual(['Blush & Bloom', 'Garden of Dreams', 'Gilded Evening', 'Whispers of Noor'])
    expect(byName['Blush & Bloom'].status).toBe('past')
    expect(byName['Garden of Dreams'].status).toBe('draft')
    expect(byName['Whispers of Noor']).toMatchObject({
      status: 'active',
      budgetPKR: 2_500_000,
      progress: { questionnaire: 'complete', moodboard: 'complete', budget: 'in_progress', ar: 'in_progress' },
    })
    // Sorted soonest first by default.
    expect(res.json()[0].name).toBe('Blush & Bloom')
  }, 60_000)
})
