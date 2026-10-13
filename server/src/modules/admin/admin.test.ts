import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp } from '../../test/app'
import { resetDb } from '../../test/db'
import { createUser, TEST_PASSWORD } from '../../test/users'
import { SESSION_COOKIE } from '../auth/sessions'
import { clearAnalyticsCache } from './analytics'

type TestApp = Awaited<ReturnType<typeof buildTestApp>>
let app: TestApp

beforeAll(async () => {
  app = await buildTestApp({ LOGIN_MAX_PER_IP: '1000' })
})
afterAll(async () => {
  await app.close()
})
beforeEach(async () => {
  await resetDb(app.prisma)
  clearAnalyticsCache()
  app.sentMail.sent.length = 0
})

type Cookies = Record<string, string>
async function signIn(email: string, password = TEST_PASSWORD): Promise<Cookies> {
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } })
  const c = res.cookies.find((x) => x.name === SESSION_COOKIE)
  if (!c) throw new Error(`login failed: ${res.body}`)
  return { [SESSION_COOKIE]: c.value }
}
const req = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, cookies: Cookies, payload?: object) =>
  app.inject({ method, url: `/api/v1${url}`, cookies, payload })

async function world() {
  const admin = await createUser(app.prisma, { role: 'ADMIN', name: 'Elation Admin' })
  const ayesha = await createUser(app.prisma, { role: 'CONSULTANT', name: 'Ayesha Malik' })
  const sara = await createUser(app.prisma, { role: 'CONSULTANT', name: 'Sara Khan' })
  const malaika = await createUser(app.prisma, { consultantId: ayesha.id, name: 'Malaika Khan' })
  const zara = await createUser(app.prisma, { consultantId: sara.id, name: 'Zara Ahmed' })
  const [asAdmin, asAyesha, asSara, asMalaika] = await Promise.all([signIn(admin.email), signIn(ayesha.email), signIn(sara.email), signIn(malaika.email)])
  const ev = (await req('POST', '/events', asMalaika, { type: 'Mehndi', concept: 'Whispers of Noor', date: '2027-03-14', guests: 250, venueName: 'Lawn', city: 'Lahore', venueSetting: 'Outdoor' })).json()
  return { admin, ayesha, sara, malaika, zara, asAdmin, asAyesha, asSara, asMalaika, eventId: ev.id as string }
}

describe('client lifecycle', () => {
  it('invite → activate → extend → revoke → restore, with emails and an access history', async () => {
    const { asAdmin, ayesha } = await world()
    const invite = await req('POST', '/admin/clients/invite', asAdmin, { name: 'Hira Shah', email: 'hira@test.local', consultantId: ayesha.id, accessDays: 30 })
    expect(invite.statusCode).toBe(201)
    expect(app.sentMail.last('hira@test.local')!.subject).toContain('studio')
    const code = new URL(invite.json().activationUrl).searchParams.get('code')!
    const hiraId = invite.json().userId as string

    // A fresh link replaces the first one.
    const resent = await req('POST', `/admin/clients/${hiraId}/resend-invite`, asAdmin)
    expect(resent.statusCode).toBe(200)
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/invite/accept', payload: { code, password: 'a lovely mehndi evening' } })).statusCode).toBeGreaterThanOrEqual(400)
    const code2 = new URL(resent.json().activationUrl).searchParams.get('code')!
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/invite/accept', payload: { code: code2, password: 'a lovely mehndi evening' } })).statusCode).toBe(200)

    const before = (await req('GET', `/admin/clients/${hiraId}`, asAdmin)).json()
    expect(before.status).toBe('active')
    const extended = await req('POST', `/admin/clients/${hiraId}/extend`, asAdmin, { days: 60 })
    expect(extended.statusCode).toBe(200)
    const gained = (Date.parse(extended.json().accessExpiresAt) - Date.parse(before.accessExpiresAt)) / 86_400_000
    expect(Math.round(gained)).toBe(60)
    expect(app.sentMail.last('hira@test.local')!.subject).toContain('access now runs to')
    const general = await app.prisma.thread.findFirstOrThrow({ where: { clientId: hiraId, eventId: null } })
    expect((await app.prisma.message.findFirstOrThrow({ where: { threadId: general.id }, orderBy: { id: 'desc' } })).body).toMatch(/^Your access has been extended to/)

    const asHira = await signIn('hira@test.local', 'a lovely mehndi evening')
    expect((await req('POST', `/admin/clients/${hiraId}/revoke`, asAdmin, { reason: 'Event cancelled' })).json().status).toBe('revoked')
    expect((await req('GET', '/me', asHira)).statusCode).toBe(401) // sessions ended
    expect((await req('POST', `/admin/clients/${hiraId}/extend`, asAdmin, { days: 5 })).statusCode).toBe(422)
    expect((await req('POST', `/admin/clients/${hiraId}/restore`, asAdmin)).json().status).toBe('active')

    const history = (await req('GET', `/admin/clients/${hiraId}`, asAdmin)).json().access.map((a: { action: string }) => a.action)
    expect(history).toEqual(['user.restore', 'user.revoke', 'user.extend', 'user.reinvite', 'user.invite'])
  })

  it('caps consultant extensions and keeps revoke/restore/reassign for admins', async () => {
    const { asAyesha, malaika, sara } = await world()
    expect((await req('POST', `/admin/clients/${malaika.id}/extend`, asAyesha, { days: 30 })).statusCode).toBe(200)
    const tooMuch = await req('POST', `/admin/clients/${malaika.id}/extend`, asAyesha, { days: 31 })
    expect(tooMuch.statusCode).toBe(403)
    expect((await req('POST', `/admin/clients/${malaika.id}/revoke`, asAyesha, { reason: 'test it' })).statusCode).toBe(403)
    expect((await req('PATCH', `/admin/clients/${malaika.id}`, asAyesha, { consultantId: sara.id })).statusCode).toBe(403)
    expect((await req('PATCH', `/admin/clients/${malaika.id}`, asAyesha, { phone: '+92 300 0000000' })).json().phone).toBe('+92 300 0000000')
  })

  it('moves a client to another consultant: threads follow, the previous consultant loses access', async () => {
    const { asAdmin, asAyesha, asSara, malaika, sara } = await world()
    const [thread] = (await req('GET', '/threads', asAyesha)).json()
    expect((await req('PATCH', `/admin/clients/${malaika.id}`, asAdmin, { consultantId: sara.id })).statusCode).toBe(200)
    expect((await req('GET', `/threads/${thread.id}/messages`, asAyesha)).statusCode).toBe(404)
    expect((await req('GET', `/threads/${thread.id}/messages`, asSara)).statusCode).toBe(200)
    expect((await req('GET', `/admin/clients/${malaika.id}`, asAyesha)).statusCode).toBe(404)
  })
})

describe('policy matrix: consultants see only their own clients', () => {
  it('404s every client-scoped admin route for another consultant’s client', async () => {
    const w = await world()
    const noteRes = await req('POST', `/admin/clients/${w.malaika.id}/notes`, w.asAyesha, { body: 'Call about florals', followUpAt: '2027-01-10' })
    expect(noteRes.statusCode).toBe(201)
    const noteId = noteRes.json().id

    const asSara = w.asSara
    const forbidden = [
      req('GET', `/admin/clients/${w.malaika.id}`, asSara),
      req('PATCH', `/admin/clients/${w.malaika.id}`, asSara, { phone: '1' }),
      req('POST', `/admin/clients/${w.malaika.id}/extend`, asSara, { days: 1 }),
      req('POST', `/admin/clients/${w.malaika.id}/resend-invite`, asSara),
      req('GET', `/admin/clients/${w.malaika.id}/notes`, asSara),
      req('POST', `/admin/clients/${w.malaika.id}/notes`, asSara, { body: 'x' }),
      req('PATCH', `/admin/notes/${noteId}`, asSara, { done: true }),
      req('GET', `/events/${w.eventId}`, asSara),
    ]
    for (const res of await Promise.all(forbidden)) expect(res.statusCode, res.body).toBe(404)

    const list = (await req('GET', '/admin/clients', asSara)).json()
    expect(list.rows.map((r: { name: string }) => r.name)).toEqual(['Zara Ahmed'])
    const all = (await req('GET', '/admin/clients?sort=name', w.asAdmin)).json()
    expect(all.rows.map((r: { name: string }) => r.name)).toEqual(['Malaika Khan', 'Zara Ahmed'])
    expect((await req('GET', '/admin/follow-ups?due=all', asSara)).json()).toHaveLength(0)
    expect((await req('GET', '/admin/follow-ups?due=all', w.asAyesha)).json()).toHaveLength(1)
    expect((await req('GET', '/admin/quotes', asSara)).json()).toHaveLength(0)
    expect((await req('GET', '/admin/overview', asSara)).json().kpis.activeClients).toBe(1)
  })

  it('keeps clients out of the whole console and staff-only routes away from consultants', async () => {
    const w = await world()
    for (const url of ['/admin/clients', '/admin/overview', '/admin/quotes', '/admin/inquiries', '/admin/ar-sets', '/admin/inspirations']) {
      expect((await req('GET', url, w.asMalaika)).statusCode).toBe(403)
    }
    for (const url of ['/admin/team', `/admin/audit?targetId=${w.malaika.id}`]) {
      expect((await req('GET', url, w.asAyesha)).statusCode).toBe(403)
    }
    expect((await req('PATCH', '/admin/settings', w.asAyesha, { defaultAccessDays: 120 })).statusCode).toBe(403)
  })
})

describe('quotes', () => {
  it('marks a quote ready: plan quoted, client told by message, activity and email', async () => {
    const w = await world()
    await app.prisma.inventoryItem.create({ data: { sku: 'ARCH', name: 'Arch', category: 'BACKDROP', colour: 'Ivory', unit: 'EACH', pricePkr: 100_000, tags: ['stage'] } })
    await req('POST', `/events/${w.eventId}/budget`, w.asMalaika, { targetPkr: 1_000_000, seedFrom: 'rules' })
    const q = await req('POST', `/events/${w.eventId}/budget/quote`, w.asMalaika, {})
    expect(q.statusCode, q.body).toBeLessThan(300)
    const [quote] = (await req('GET', '/admin/quotes?status=open', w.asAyesha)).json()
    expect(quote.client.name).toBe('Malaika Khan')
    const done = await req('PATCH', `/admin/quotes/${quote.id}`, w.asAyesha, { status: 'quoted', message: 'Includes setup' })
    expect(done.json()).toMatchObject({ status: 'quoted', handledBy: { name: 'Ayesha Malik' } })
    expect((await app.prisma.budgetPlan.findFirstOrThrow({ where: { eventId: w.eventId } })).status).toBe('QUOTED')
    expect(app.sentMail.last(w.malaika.email)!.subject).toContain('quote')
    expect((await req('PATCH', `/admin/quotes/${quote.id}`, w.asSara, { status: 'closed' })).statusCode).toBe(404)
  })
})

describe('inquiries', () => {
  it('takes the public form, ignores bots, converts to an invited client with a draft event', async () => {
    const w = await world()
    const form = { name: 'Ayla Noor', email: 'ayla@test.local', eventType: 'Baraat', eventDate: '2027-02-01', guestRange: '250–500', city: 'Karachi' }
    expect((await app.inject({ method: 'POST', url: '/api/v1/public/inquiries', payload: form })).statusCode).toBe(202)
    expect((await app.inject({ method: 'POST', url: '/api/v1/public/inquiries', payload: { ...form, email: 'bot@test.local', website: 'spam.example' } })).statusCode).toBe(202)
    const list = (await req('GET', '/admin/inquiries', w.asAdmin)).json()
    expect(list.map((i: { email: string }) => i.email)).toEqual(['ayla@test.local'])

    const converted = await req('POST', `/admin/inquiries/${list[0].id}/convert`, w.asAyesha, {})
    expect(converted.statusCode).toBe(201)
    expect(converted.json().inquiry.status).toBe('converted')
    const user = await app.prisma.user.findUniqueOrThrow({ where: { email: 'ayla@test.local' }, include: { events: true } })
    expect(user).toMatchObject({ status: 'INVITED', consultantId: w.ayesha.id })
    expect(user.events[0]).toMatchObject({ type: 'BARAAT', venueCity: 'Karachi' })
    expect((await req('POST', `/admin/inquiries/${list[0].id}/convert`, w.asAyesha, {})).statusCode).toBe(422)
  })

  it('rate-limits the public form per IP', async () => {
    for (let i = 0; i < 3; i++) {
      expect((await app.inject({ method: 'POST', url: '/api/v1/public/inquiries', remoteAddress: '10.9.9.9', payload: { name: 'Spam Me', email: `s${i}@test.local` } })).statusCode).toBe(202)
    }
    expect((await app.inject({ method: 'POST', url: '/api/v1/public/inquiries', remoteAddress: '10.9.9.9', payload: { name: 'Spam Me', email: 's9@test.local' } })).statusCode).toBe(429)
  })
})

describe('analytics reconcile with a hand count', () => {
  it('counts themes, budgets, event types, the funnel and inventory use', async () => {
    const w = await world()
    // Malaika: Mehndi (from world), answers + budget; Zara: two events.
    const asZara = await signIn(w.zara.email)
    const e2 = (await req('POST', '/events', asZara, { type: 'Baraat', concept: 'Gilded', date: '2027-04-01', guests: 400, venueName: 'Hall', city: 'Lahore', venueSetting: 'Indoor' })).json()
    await req('POST', '/events', asZara, { type: 'Mehndi', concept: 'Garden', date: '2027-03-30', guests: 150, venueName: 'Lawn', city: 'Lahore', venueSetting: 'Outdoor' })
    const answer = async (cookies: Cookies, eventId: string, set: object) => {
      const q = (await req('GET', `/events/${eventId}/questionnaire`, cookies)).json()
      const res = await app.inject({ method: 'PATCH', url: `/api/v1/events/${eventId}/questionnaire`, cookies, payload: { version: q.version, set } })
      expect(res.statusCode, res.body).toBe(200)
    }
    await answer(w.asMalaika, w.eventId, { q10_aesthetic: ['Romantic', 'Luxury'], q121_budget: 'PKR 1M–2M' })
    await answer(asZara, e2.id, { q10_aesthetic: ['Romantic'], q121_budget: 'PKR 2M–5M' })
    const arch = await app.prisma.inventoryItem.create({ data: { sku: 'ARCH', name: 'Ivory Arch', category: 'BACKDROP', colour: 'Ivory', unit: 'EACH', pricePkr: 100_000, tags: ['stage'] } })
    await req('POST', `/events/${w.eventId}/budget`, w.asMalaika, { targetPkr: 1_500_000, seedFrom: 'blank' })
    await req('POST', `/events/${w.eventId}/budget/lines`, w.asMalaika, { inventoryItemId: arch.id, qty: 2 })

    const a = (await req('GET', '/admin/analytics', w.asAdmin)).json()
    expect(a.themes.aesthetics).toEqual([
      { label: 'Romantic', value: 2 },
      { label: 'Luxury', value: 1 },
    ])
    expect(a.budgets.bands).toEqual([
      { label: 'PKR 1M–2M', value: 1 },
      { label: 'PKR 2M–5M', value: 1 },
    ])
    expect(a.budgets.targets).toEqual([{ label: '10L–20L', value: 1 }])
    expect(a.budgets.lights).toEqual([{ label: 'yellow', value: 1 }]) // 2L of 15L
    const month = new Date().toISOString().slice(0, 7)
    expect(a.eventTypes).toEqual([
      { month, type: 'Mehndi', value: 2 },
      { month, type: 'Baraat', value: 1 },
    ])
    expect(a.funnel).toEqual([
      { label: 'Invited', value: 2 },
      { label: 'Activated', value: 2 },
      { label: 'Questionnaire half done', value: 0 },
      { label: 'Questionnaire submitted', value: 0 },
      { label: 'Moodboard saved', value: 0 },
      { label: 'Quote requested', value: 0 },
    ])
    expect(a.inventory).toEqual([{ label: 'Ivory Arch', sku: 'ARCH', moodboards: 0, budgets: 1 }])

    // A consultant's view counts only their clients.
    clearAnalyticsCache()
    const sara = (await req('GET', '/admin/analytics', w.asSara)).json()
    expect(sara.themes.aesthetics).toEqual([{ label: 'Romantic', value: 1 }])
    const csv = await req('GET', '/admin/analytics/export.csv?report=funnel', w.asAdmin)
    expect(csv.headers['content-type']).toContain('text/csv')
    expect(csv.body.split('\n')[0]).toBe('stage,count')
  })
})

describe('CMS', () => {
  it('creates, publishes and unpublishes an inspiration; clients only see it published', async () => {
    const w = await world()
    const item = await app.prisma.inventoryItem.create({ data: { sku: 'ROSE', name: 'Rose Wall', category: 'FLORAL', colour: 'Blush', unit: 'EACH', pricePkr: 50_000, tags: ['stage'] } })
    const body = {
      name: 'Moonlit Courtyard',
      eventTypes: ['Mehndi'],
      style: 'Romantic · Serene',
      palette: ['#E3BFB9'],
      coverUrl: '/media/img_01.jpg',
      summary: 'Lanterns and jasmine.',
      tiles: [{ imageUrl: '/media/img_02.jpg' }],
      items: [{ inventoryItemId: item.id, category: 'Florals', qtyFixed: 2 }],
    }
    const created = await req('POST', '/admin/inspirations', w.asAyesha, body)
    expect(created.statusCode, created.body).toBe(201)
    expect(created.json()).toMatchObject({ slug: 'moonlit-courtyard', published: false })
    expect((await req('GET', '/inspirations', w.asMalaika)).json()).toHaveLength(0)
    expect((await req('POST', `/admin/inspirations/${created.json().id}/publish`, w.asAyesha)).statusCode).toBe(403) // admins publish
    expect((await req('POST', `/admin/inspirations/${created.json().id}/publish`, w.asAdmin)).statusCode).toBe(200)
    expect((await req('GET', '/inspirations', w.asMalaika)).json().map((i: { slug: string }) => i.slug)).toEqual(['moonlit-courtyard'])
    expect((await req('POST', '/admin/inspirations', w.asAyesha, body)).statusCode).toBe(409) // slug taken
    expect((await req('POST', '/admin/inspirations', w.asAyesha, { ...body, name: 'Other', coverUrl: 'javascript:alert(1)' })).statusCode).toBe(400)
    expect((await req('DELETE', `/admin/inspirations/${created.json().id}`, w.asAyesha)).statusCode).toBe(403)
    expect((await req('DELETE', `/admin/inspirations/${created.json().id}`, w.asAdmin)).statusCode).toBe(204)
  })

  it('turning an AR set READY emails everyone waiting, once, and tells the client', async () => {
    const w = await world()
    const set = await req('POST', '/admin/ar-sets', w.asAyesha, { eventId: w.eventId, eventType: 'Mehndi', title: 'Noor in AR', theme: 'Noor', coverUrl: '/media/img_03.jpg' })
    expect(set.statusCode, set.body).toBe(201)
    expect((await req('POST', `/ar-sets/${set.json().id}/notify-me`, w.asMalaika)).statusCode).toBeLessThan(300)
    expect((await req('POST', `/admin/ar-sets/${set.json().id}/status`, w.asSara, { status: 'ready', progressPercent: 100 })).statusCode).toBe(404)
    const ready = await req('POST', `/admin/ar-sets/${set.json().id}/status`, w.asAyesha, { status: 'ready', progressPercent: 90 })
    expect(ready.json()).toMatchObject({ status: 'ready', progressPercent: 100, notifyCount: 0 })
    expect(app.sentMail.sent.filter((m) => m.to === w.malaika.email && m.subject.includes('ready to preview'))).toHaveLength(1)
    await req('POST', `/admin/ar-sets/${set.json().id}/status`, w.asAyesha, { status: 'ready', progressPercent: 100 })
    expect(app.sentMail.sent.filter((m) => m.to === w.malaika.email && m.subject.includes('ready to preview'))).toHaveLength(1)
    const activity = (await req('GET', `/activity?eventId=${w.eventId}`, w.asMalaika)).json().entries
    expect(activity[0].title).toBe('Noor in AR is ready to preview')
  })
})

describe('team & settings', () => {
  it('invites staff, refuses to deactivate someone with clients until they are moved, never removes the last admin', async () => {
    const w = await world()
    const invited = await req('POST', '/admin/team', w.asAdmin, { name: 'New Consultant', email: 'newc@test.local', role: 'consultant' })
    expect(invited.statusCode).toBe(201)
    expect(app.sentMail.last('newc@test.local')!.subject).toContain('team')
    expect((await req('PATCH', `/admin/team/${w.ayesha.id}`, w.asAdmin, { active: false })).statusCode).toBe(422)
    const moved = await req('PATCH', `/admin/team/${w.ayesha.id}`, w.asAdmin, { active: false, reassignClientsTo: w.sara.id })
    expect(moved.json()).toMatchObject({ status: 'revoked', clientCount: 0 })
    expect((await app.prisma.user.findUniqueOrThrow({ where: { id: w.malaika.id } })).consultantId).toBe(w.sara.id)
    expect((await req('GET', '/me', w.asAyesha)).statusCode).toBe(401) // sessions ended
    expect((await req('PATCH', `/admin/team/${w.admin.id}`, w.asAdmin, { role: 'consultant' })).statusCode).toBe(422)
  })

  it('settings change the default access window and the consultant extension cap', async () => {
    const w = await world()
    const s = await req('PATCH', '/admin/settings', w.asAdmin, { defaultAccessDays: 120, consultantMaxExtendDays: 10, inviteIntro: 'Mubarak ho!' })
    expect(s.json()).toMatchObject({ defaultAccessDays: 120, consultantMaxExtendDays: 10 })
    await req('POST', '/admin/clients/invite', w.asAyesha, { name: 'Sana Ali', email: 'sana@test.local' })
    expect(app.sentMail.last('sana@test.local')!.text).toContain('Mubarak ho!')
    expect((await app.prisma.invite.findFirstOrThrow({ where: { email: 'sana@test.local' } })).accessDays).toBe(120)
    expect((await req('POST', `/admin/clients/${w.malaika.id}/extend`, w.asAyesha, { days: 11 })).statusCode).toBe(403)
  })
})

describe('review hardening', () => {
  it("won't let a consultant take over another consultant's pending invite", async () => {
    const w = await world()
    const first = await req('POST', '/admin/clients/invite', w.asAyesha, { name: 'Hira Shah', email: 'hira@test.local' })
    expect(first.statusCode).toBe(201)
    const hijack = await req('POST', '/admin/clients/invite', w.asSara, { name: 'Hira Shah', email: 'hira@test.local' })
    expect(hijack.statusCode).toBe(409)
    expect(hijack.json().activationUrl).toBeUndefined()
    expect((await app.prisma.user.findUniqueOrThrow({ where: { email: 'hira@test.local' } })).consultantId).toBe(w.ayesha.id)
  })

  it('kills open invites when an invited account is revoked', async () => {
    const w = await world()
    const inv = (await req('POST', '/admin/clients/invite', w.asAdmin, { name: 'Hira Shah', email: 'hira@test.local' })).json()
    const code = new URL(inv.activationUrl).searchParams.get('code')!
    await req('POST', `/admin/clients/${inv.userId}/revoke`, w.asAdmin, { reason: 'Changed plans' })
    const accept = await app.inject({ method: 'POST', url: '/api/v1/auth/invite/accept', payload: { code, password: 'a lovely mehndi evening' } })
    expect(accept.statusCode).toBe(404)
  })

  it('keeps showcase AR sets and sent quotes safe, and refuses impossible dates', async () => {
    const w = await world()
    const showcase = await app.prisma.aRSet.create({ data: { eventType: 'MEHNDI', title: 'Showcase', theme: 'Noor', coverUrl: '/c.jpg', summary: '', highlights: [], aerialUrls: [] } })
    expect((await req('POST', `/admin/ar-sets/${showcase.id}/status`, w.asAyesha, { status: 'ready', progressPercent: 100 })).statusCode).toBe(403)
    expect((await req('POST', `/admin/ar-sets/${showcase.id}/status`, w.asAdmin, { status: 'ready', progressPercent: 100 })).statusCode).toBe(200)

    await app.prisma.inventoryItem.create({ data: { sku: 'ARCH', name: 'Arch', category: 'BACKDROP', colour: 'Ivory', unit: 'EACH', pricePkr: 100_000, tags: ['stage'] } })
    await req('POST', `/events/${w.eventId}/budget`, w.asMalaika, { targetPkr: 1_000_000, seedFrom: 'rules' })
    await req('POST', `/events/${w.eventId}/budget/quote`, w.asMalaika, {})
    const [quote] = (await req('GET', '/admin/quotes', w.asAyesha)).json()
    await req('PATCH', `/admin/quotes/${quote.id}`, w.asAyesha, { status: 'quoted' })
    expect((await req('PATCH', `/admin/quotes/${quote.id}`, w.asAyesha, { status: 'open' })).statusCode).toBe(422)
    expect((await req('PATCH', `/admin/quotes/${quote.id}`, w.asAyesha, { status: 'closed' })).statusCode).toBe(200)

    expect((await req('POST', `/admin/clients/${w.malaika.id}/extend`, w.asAdmin, { until: '2027-13-01' })).statusCode).toBe(400)
    expect((await req('POST', `/admin/clients/${w.malaika.id}/notes`, w.asAyesha, { body: 'x', followUpAt: '2027-02-30' })).statusCode).toBe(400)
  })

  it('adds up two extensions made at the same time', async () => {
    const w = await world()
    const before = (await app.prisma.user.findUniqueOrThrow({ where: { id: w.malaika.id } })).accessExpiresAt!
    const [a, b] = await Promise.all([
      req('POST', `/admin/clients/${w.malaika.id}/extend`, w.asAdmin, { days: 10 }),
      req('POST', `/admin/clients/${w.malaika.id}/extend`, w.asAdmin, { days: 10 }),
    ])
    expect([a.statusCode, b.statusCode]).toEqual([200, 200])
    const after = (await app.prisma.user.findUniqueOrThrow({ where: { id: w.malaika.id } })).accessExpiresAt!
    expect(Math.round((after.getTime() - before.getTime()) / 86_400_000)).toBe(20)
  })

  it('guards CSV exports against spreadsheet formulas', async () => {
    const w = await world()
    const asMalaika = w.asMalaika
    const q = (await req('GET', `/events/${w.eventId}/questionnaire`, asMalaika)).json()
    await app.inject({ method: 'PATCH', url: `/api/v1/events/${w.eventId}/questionnaire`, cookies: asMalaika, payload: { version: q.version, set: { q121_budget: 'PKR 1M–2M' } } })
    // Item names are staff-entered; a formula-looking one must come out inert.
    const arch = await app.prisma.inventoryItem.create({ data: { sku: 'EVIL', name: '=HYPERLINK("http://x")', category: 'BACKDROP', colour: 'Ivory', unit: 'EACH', pricePkr: 1000, tags: ['stage'] } })
    await req('POST', `/events/${w.eventId}/budget`, asMalaika, { targetPkr: 1_000_000, seedFrom: 'blank' })
    await req('POST', `/events/${w.eventId}/budget/lines`, asMalaika, { inventoryItemId: arch.id, qty: 1 })
    const csv = (await req('GET', '/admin/analytics/export.csv?report=inventory&fresh=true', w.asAdmin)).body
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`)
  })
})
