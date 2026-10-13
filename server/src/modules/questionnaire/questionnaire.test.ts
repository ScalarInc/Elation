import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
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

async function signIn(email: string) {
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password: TEST_PASSWORD } })
  return { [SESSION_COOKIE]: res.cookies.find((c) => c.name === SESSION_COOKIE)!.value }
}

async function setup() {
  const consultant = await createUser(app.prisma, { role: 'CONSULTANT', name: 'Ayesha Malik' })
  const client = await createUser(app.prisma, { consultantId: consultant.id })
  const asClient = await signIn(client.email)
  const event = (
    await app.inject({
      method: 'POST',
      url: '/api/v1/events',
      cookies: asClient,
      payload: {
        type: 'Mehndi',
        concept: 'Whispers of Noor',
        date: '2027-03-14',
        guests: 320,
        venueName: 'Hilltop Grounds',
        city: 'Islamabad',
        venueSetting: 'Outdoor',
      },
    })
  ).json()
  return { client, consultant, asClient, asConsultant: await signIn(consultant.email), eventId: event.id as string }
}

const url = (id: string, suffix = '') => `/api/v1/events/${id}/questionnaire${suffix}`

describe('read + save', () => {
  it('starts with the event basics answered and version 1', async () => {
    const { asClient, eventId } = await setup()
    const res = await app.inject({ method: 'GET', url: url(eventId), cookies: asClient })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      version: 1,
      submittedAt: null,
      answers: { q1_type: 'Mehndi', q4_guests: 320 },
    })
    expect(res.json().categories).toHaveLength(24)
  })

  it('saves a batch, bumps the version, records a revision and one activity entry', async () => {
    const { asClient, eventId } = await setup()
    const first = await app.inject({
      method: 'PATCH',
      url: url(eventId),
      cookies: asClient,
      payload: { version: 1, set: { q10_aesthetic: ['Romantic'], q46_ceiling: 'Yes' } },
    })
    expect(first.statusCode).toBe(200)
    expect(first.json().version).toBe(2)

    const second = await app.inject({
      method: 'PATCH',
      url: url(eventId),
      cookies: asClient,
      payload: { version: 2, set: { q76_florals: 'Yes' }, decides: { q2_name: true } },
    })
    expect(second.json()).toMatchObject({ version: 3, elationDecides: { q2_name: true } })
    expect(second.json().answers.q2_name).toBeUndefined()

    expect(await app.prisma.questionnaireRevision.count({ where: { eventId } })).toBe(3) // create + 2 saves
    const activity = await app.prisma.activityEntry.findMany({ where: { eventId, kind: 'QUESTIONNAIRE' } })
    expect(activity).toHaveLength(1) // debounced
    expect(activity[0].detail).toBe('Event Basics, Overall Design Direction, Ceiling / Roof, Florals')
  })

  it('a no-op save does not bump the version', async () => {
    const { asClient, eventId } = await setup()
    const res = await app.inject({ method: 'PATCH', url: url(eventId), cookies: asClient, payload: { version: 1, set: { q4_guests: 320 } } })
    expect(res.json().version).toBe(1)
  })

  it('returns 409 with the current document when the version is stale', async () => {
    const { asClient, eventId } = await setup()
    await app.inject({ method: 'PATCH', url: url(eventId), cookies: asClient, payload: { version: 1, set: { q46_ceiling: 'No' } } })
    const stale = await app.inject({ method: 'PATCH', url: url(eventId), cookies: asClient, payload: { version: 1, set: { q46_ceiling: 'Yes' } } })
    expect(stale.statusCode).toBe(409)
    expect(stale.json().error.code).toBe('VERSION_CONFLICT')
    expect(stale.json().error.details.current).toMatchObject({ version: 2, answers: { q46_ceiling: 'No' } })
  })

  it('validates answers per question', async () => {
    const { asClient, eventId } = await setup()
    const res = await app.inject({
      method: 'PATCH',
      url: url(eventId),
      cookies: asClient,
      payload: { version: 1, set: { q1_type: 'Rave', q999: 1 }, decides: { q1_type: true } },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('INVALID_ANSWERS')
    expect(res.json().error.details.issues.map((i: { qid: string }) => i.qid).sort()).toEqual(['q1_type', 'q1_type', 'q999'])
  })
})

describe('write-through to the event', () => {
  it('basics answers update the event; a budget band only fills a missing budget', async () => {
    const { asClient, eventId } = await setup()
    await app.inject({
      method: 'PATCH',
      url: url(eventId),
      cookies: asClient,
      payload: { version: 1, set: { q4_guests: 450, q2_name: 'Noor', q121_budget: 'PKR 2M–5M' } },
    })
    let event = (await app.inject({ method: 'GET', url: `/api/v1/events/${eventId}`, cookies: asClient })).json()
    expect(event).toMatchObject({ guests: 450, name: 'Noor', concept: 'Noor', budgetPKR: 3_500_000 })

    // Changing the band moves a band-derived budget…
    await app.inject({ method: 'PATCH', url: url(eventId), cookies: asClient, payload: { version: 2, set: { q121_budget: 'PKR 1M–2M' } } })
    event = (await app.inject({ method: 'GET', url: `/api/v1/events/${eventId}`, cookies: asClient })).json()
    expect(event.budgetPKR).toBe(1_500_000)

    // …but never an explicit one.
    await app.inject({ method: 'PATCH', url: `/api/v1/events/${eventId}`, cookies: asClient, payload: { budgetPkr: 2_222_000 } })
    const q = (await app.inject({ method: 'GET', url: url(eventId), cookies: asClient })).json()
    await app.inject({ method: 'PATCH', url: url(eventId), cookies: asClient, payload: { version: q.version, set: { q121_budget: 'PKR 5M+' } } })
    event = (await app.inject({ method: 'GET', url: `/api/v1/events/${eventId}`, cookies: asClient })).json()
    expect(event.budgetPKR).toBe(2_222_000)
  })

  it('activates a draft once a quarter of the questionnaire is answered', async () => {
    const { asClient, eventId } = await setup()
    const set: Record<string, unknown> = {
      q7_dimensions: { w: 100, d: 80 }, q9_areas: ['Entrance'], q10_aesthetic: ['Romantic'], q11_atmosphere: ['Dreamy'],
      q12_theme: 'Garden', q14_reference_likes: ['Colours'], q15_reference_dislikes: 'None', q16_colours: { desc: 'Blush' },
      q17_dominant: 'Blush', q18_accents: 'Gold', q19_avoid_colours: 'Black', q20_direction: 'Pastel', q21_metallic: 'Gold',
      q22_entrance: 'No', q29_stage: 'No', q40_dance: 'No', q46_ceiling: 'No', q56_floor: 'No', q61_tables: 'No',
      q71_lounges: 'No', q76_florals: 'No', q90_fabric: 'No', q95_structures: 'No', q102_photo: 'No', q106_signage: 'No',
    }
    const res = await app.inject({ method: 'PATCH', url: url(eventId), cookies: asClient, payload: { version: 1, set } })
    expect(res.json().percentComplete).toBeGreaterThanOrEqual(25)
    const event = (await app.inject({ method: 'GET', url: `/api/v1/events/${eventId}`, cookies: asClient })).json()
    expect(event.status).toBe('active')
  })
})

describe('submit, brief, history, access', () => {
  it('refuses to submit with required questions missing, then submits', async () => {
    const { asClient, eventId } = await setup()
    const early = await app.inject({ method: 'POST', url: url(eventId, '/submit'), cookies: asClient })
    expect(early.statusCode).toBe(422)
    expect(early.json().error.details.missing).toEqual(
      expect.arrayContaining(['q22_entrance', 'q29_stage', 'q121_budget', 'q130_control']),
    )

    await app.inject({
      method: 'PATCH',
      url: url(eventId),
      cookies: asClient,
      payload: { version: 1, set: { q22_entrance: 'No', q29_stage: 'No', q121_budget: 'PKR 1M–2M' }, decides: {} },
    })
    await app.inject({ method: 'PATCH', url: url(eventId), cookies: asClient, payload: { version: 2, set: { q130_control: 'Elation can take the lead' } } })

    const ok = await app.inject({ method: 'POST', url: url(eventId, '/submit'), cookies: asClient })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().submittedAt).not.toBeNull()
    const event = (await app.inject({ method: 'GET', url: `/api/v1/events/${eventId}`, cookies: asClient })).json()
    expect(event.progress.questionnaire).toBe('complete')

    const reopened = await app.inject({ method: 'POST', url: url(eventId, '/reopen'), cookies: asClient })
    expect(reopened.json().submittedAt).toBeNull()
  })

  it('builds a readable brief of visible answers only', async () => {
    const { asClient, eventId } = await setup()
    await app.inject({
      method: 'PATCH',
      url: url(eventId),
      cookies: asClient,
      payload: { version: 1, set: { q46_ceiling: 'No', q47_ceiling_type: ['Chandeliers'], q16_colours: { desc: 'Blush', hex: ['#E3BFB9'] } }, decides: { q2_name: true } },
    })
    const brief = (await app.inject({ method: 'GET', url: url(eventId, '/brief'), cookies: asClient })).json()
    const items = brief.categories.flatMap((c: { items: { qid: string }[] }) => c.items)
    const byId = Object.fromEntries(items.map((i: { qid: string }) => [i.qid, i]))
    expect(byId.q47_ceiling_type).toBeUndefined() // hidden by "No ceiling décor"
    expect(byId.q16_colours.answer).toBe('Blush — #E3BFB9')
    expect(byId.q2_name).toMatchObject({ answer: null, elationDecides: true })
    expect(byId.q7_dimensions).toBeUndefined() // unanswered
  })

  it('shows answer history to the consultant but not the client', async () => {
    const { asClient, asConsultant, eventId } = await setup()
    await app.inject({ method: 'PATCH', url: url(eventId), cookies: asClient, payload: { version: 1, set: { q4_guests: 500 } } })

    expect((await app.inject({ method: 'GET', url: url(eventId, '/revisions'), cookies: asClient })).statusCode).toBe(403)
    const history = (await app.inject({ method: 'GET', url: url(eventId, '/revisions'), cookies: asConsultant })).json()
    expect(history.items[0].changes).toEqual([{ qid: 'q4_guests', from: 320, to: 500 }])
    expect(history.items[0].actor.role).toBe('client')
  })

  it('hides other clients’ questionnaires and lets the consultant edit', async () => {
    const { asConsultant, eventId } = await setup()
    const stranger = await createUser(app.prisma)
    const res = await app.inject({ method: 'GET', url: url(eventId), cookies: await signIn(stranger.email) })
    expect(res.statusCode).toBe(404)

    const edit = await app.inject({ method: 'PATCH', url: url(eventId), cookies: asConsultant, payload: { version: 1, set: { q12_theme: 'Moonlit garden' } } })
    expect(edit.statusCode).toBe(200)
  })
})
