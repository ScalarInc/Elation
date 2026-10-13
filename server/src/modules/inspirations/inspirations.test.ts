import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp } from '../../test/app'
import { resetDb } from '../../test/db'
import { createUser, TEST_PASSWORD } from '../../test/users'
import { SESSION_COOKIE } from '../auth/sessions'
import { notifySetReady } from '../ar/service'

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

const item = (sku: string, category: 'BACKDROP' | 'CHAIR' | 'FLORAL', pricePkr: number | null) =>
  app.prisma.inventoryItem.create({
    data: { sku, name: `Piece ${sku}`, category, colour: 'Ivory', unit: 'EACH', pricePkr, tags: ['stage'], imageUrl: `/media/${sku}.jpg` },
  })

async function catalogue() {
  const [arch, chair, rose] = await Promise.all([item('ARCH', 'BACKDROP', 200_000), item('CHAIR', 'CHAIR', 1_000), item('ROSE', 'FLORAL', null)])
  const noor = await app.prisma.inspiration.create({
    data: {
      slug: 'whispers-of-noor',
      name: 'Whispers of Noor',
      eventTypes: ['MEHNDI', 'NIKKAH'],
      style: 'Romantic · Modern Luxury',
      palette: ['#E3BFB9', '#E1CBAD'],
      coverUrl: '/media/img_18.jpg',
      summary: 'Cherry blossoms and candlelight.',
      featured: true,
      budgetTier: 'Signature',
      tiles: { create: [{ position: 0, imageUrl: '/media/img_18.jpg' }, { position: 1, imageUrl: '/media/img_16.jpg' }] },
      items: {
        create: [
          { inventoryItemId: arch.id, category: 'Stage', qtyFixed: 1 },
          { inventoryItemId: chair.id, category: 'Seating', qtyPer100Guests: 100 },
          { inventoryItemId: rose.id, category: 'Florals', qtyFixed: 20 },
        ],
      },
    },
  })
  await app.prisma.inspiration.create({
    data: { slug: 'gilded-evening', name: 'Gilded Evening', eventTypes: ['BARAAT'], style: 'Regal · Dramatic', palette: ['#C9A227'], coverUrl: '/media/img_04.jpg', summary: 'Gold.', budgetTier: 'Grand' },
  })
  await app.prisma.inspiration.create({
    data: { slug: 'draft-concept', name: 'Draft Concept', eventTypes: ['MEHNDI'], style: 'Romantic', palette: [], coverUrl: '/x.jpg', summary: 'Hidden.', published: false },
  })
  return { arch, chair, rose, noor }
}

async function setup(guests = 250) {
  const consultant = await createUser(app.prisma, { role: 'CONSULTANT', name: 'Ayesha Malik' })
  const client = await createUser(app.prisma, { consultantId: consultant.id })
  const asClient = await signIn(client.email)
  const event = (
    await app.inject({
      method: 'POST',
      url: '/api/v1/events',
      cookies: asClient,
      payload: { type: 'Mehndi', concept: 'Our Mehndi', date: '2027-03-14', guests, venueName: 'Lawn', city: 'Lahore', venueSetting: 'Outdoor' },
    })
  ).json()
  return { asClient, client, consultant, eventId: event.id as string }
}

const get = (url: string, cookies: Record<string, string>) => app.inject({ method: 'GET', url: `/api/v1${url}`, cookies })
const post = (url: string, cookies: Record<string, string>, payload: object = {}) => app.inject({ method: 'POST', url: `/api/v1${url}`, cookies, payload })

describe('inspiration gallery', () => {
  it('lists published concepts with server-side filters', async () => {
    await catalogue()
    const { asClient } = await setup()
    const all = (await get('/inspirations', asClient)).json()
    expect(all.map((i: { slug: string }) => i.slug)).toEqual(['whispers-of-noor', 'gilded-evening'])
    expect((await get('/inspirations?eventType=Baraat', asClient)).json().map((i: { slug: string }) => i.slug)).toEqual(['gilded-evening'])
    expect((await get('/inspirations?tier=Signature&style=romantic', asClient)).json()).toHaveLength(1)
    expect((await get('/inspirations?palette=%23e3bfb9', asClient)).json()).toHaveLength(1)
    expect((await get('/inspirations?q=gold', asClient)).json()).toHaveLength(1)
    expect((await get('/inspirations/draft-concept', asClient)).statusCode).toBe(404)
  })

  it('shows a concept with its pieces and a "from" price for 200 guests', async () => {
    await catalogue()
    const { asClient } = await setup()
    const detail = (await get('/inspirations/whispers-of-noor', asClient)).json()
    expect(detail.tiles).toEqual(['/media/img_18.jpg', '/media/img_16.jpg'])
    expect(detail.items).toHaveLength(3)
    expect(detail.indicativeTotalPkr).toBe(200_000 + 200 * 1_000)
  })
})

describe('adopt', () => {
  it('creates the lead moodboard, a priced budget, and fills empty style answers', async () => {
    const { arch, chair } = await catalogue()
    const { asClient, eventId } = await setup(250)
    const res = await post('/inspirations/whispers-of-noor/adopt', asClient, { eventId })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.unpricedItems).toEqual([expect.objectContaining({ name: 'Piece ROSE' })])
    expect(body.prefilled.sort()).toEqual(['q10_aesthetic', 'q16_colours'])

    const boards = (await get(`/events/${eventId}/moodboards`, asClient)).json()
    const board = boards.find((b: { id: string }) => b.id === body.moodboardId)
    expect(board).toMatchObject({ isPrimary: true, status: 'saved', generator: 'inspiration', palette: ['#E3BFB9', '#E1CBAD'] })
    expect(board.tileItems.filter((t: { kind: string }) => t.kind === 'inspiration')).toHaveLength(2)

    const { plan } = (await get(`/events/${eventId}/budget`, asClient)).json()
    expect(plan.seededFrom).toBe('inspiration')
    expect(plan.lines.map((l: { item: { id: string }; qty: number }) => [l.item.id, l.qty])).toEqual([
      [arch.id, 1],
      [chair.id, 250],
    ])

    const q = (await get(`/events/${eventId}/questionnaire`, asClient)).json()
    expect(q.answers.q10_aesthetic).toEqual(['Romantic', 'Modern', 'Luxury'])
    expect((await get(`/events/${eventId}`, asClient)).json().progress.moodboard).toBe('complete')
  })

  it('merges into or replaces an existing budget, and never overwrites answers', async () => {
    const { arch } = await catalogue()
    const { asClient, eventId } = await setup()
    await app.inject({ method: 'PATCH', url: `/api/v1/events/${eventId}/questionnaire`, cookies: asClient, payload: { version: 1, set: { q10_aesthetic: ['Rustic'] } } })
    const other = await item('OTHER', 'CHAIR', 500)
    await post(`/events/${eventId}/budget/lines`, asClient, { inventoryItemId: other.id })

    const merged = (await post('/inspirations/whispers-of-noor/adopt', asClient, { eventId, mode: 'merge' })).json()
    expect(merged.prefilled).toEqual(['q16_colours'])
    let { plan } = (await get(`/events/${eventId}/budget`, asClient)).json()
    expect(plan.lines.map((l: { item: { id: string } }) => l.item.id)).toContain(other.id)
    expect(plan.lines).toHaveLength(3)

    await post('/inspirations/whispers-of-noor/adopt', asClient, { eventId, mode: 'replace' })
    ;({ plan } = (await get(`/events/${eventId}/budget`, asClient)).json())
    expect(plan.lines.map((l: { item: { id: string } }) => l.item.id)).not.toContain(other.id)
    expect(plan.lines[0].item.id).toBe(arch.id)
    expect(await app.prisma.moodboard.count({ where: { eventId, isPrimary: true } })).toBe(1)
    expect((await get(`/events/${eventId}/questionnaire`, asClient)).json().answers.q10_aesthetic).toEqual(['Rustic'])
  })

  it('leaves "Elation decides" alone and never sets a PKR 0 budget', async () => {
    await catalogue()
    await app.prisma.inventoryItem.updateMany({ data: { pricePkr: null } })
    const { asClient, eventId } = await setup()
    await app.inject({ method: 'PATCH', url: `/api/v1/events/${eventId}/questionnaire`, cookies: asClient, payload: { version: 1, decides: { q16_colours: true } } })
    const res = (await post('/inspirations/whispers-of-noor/adopt', asClient, { eventId })).json()
    expect(res.prefilled).toEqual(['q10_aesthetic'])
    expect((await get(`/events/${eventId}`, asClient)).json().budgetPKR).toBeNull()
  })

  it("can't adopt into someone else's event", async () => {
    await catalogue()
    const { eventId } = await setup()
    const stranger = await signIn((await createUser(app.prisma)).email)
    expect((await post('/inspirations/whispers-of-noor/adopt', stranger, { eventId })).statusCode).toBe(404)
  })
})

describe('AR sets', () => {
  async function sets(eventId: string) {
    const own = await app.prisma.aRSet.create({
      data: { eventId, eventType: 'MEHNDI', title: 'Our Mehndi · AR', theme: 'Noor', status: 'COMING_SOON', progressPercent: 10, coverUrl: '/c.jpg', summary: 's' },
    })
    const showMehndi = await app.prisma.aRSet.create({
      data: { eventType: 'MEHNDI', title: 'Showcase Mehndi', theme: 'Noor', status: 'READY', progressPercent: 100, coverUrl: '/c.jpg', summary: 's' },
    })
    const showBaraat = await app.prisma.aRSet.create({
      data: { eventType: 'BARAAT', title: 'Showcase Baraat', theme: 'Gilded', status: 'READY', progressPercent: 100, coverUrl: '/c.jpg', summary: 's', assets: { create: [{ name: 'Arch', source: 'Tripo AI' }] } },
    })
    return { own, showMehndi, showBaraat }
  }

  it("lists the client's own sets, then showcase sets for types they don't have", async () => {
    const { asClient, eventId } = await setup()
    const { own, showBaraat } = await sets(eventId)
    const list = (await get('/ar-sets', asClient)).json()
    expect(list.map((s: { id: string }) => s.id)).toEqual([own.id, showBaraat.id])
    expect(list[0]).toMatchObject({ status: 'coming-soon', eventType: 'Mehndi', notifyRequested: false })
    expect(list[1].assetCount).toBe(1)

    const assets = (await get(`/ar-sets/${showBaraat.id}/assets`, asClient)).json()
    expect(assets).toEqual([expect.objectContaining({ name: 'Arch', downloadUrl: null })])
    expect((await get(`/events/${eventId}/ar`, asClient)).json().set.id).toBe(own.id)
  })

  it('notify-me is stored once and emailed when the set is ready', async () => {
    const { asClient, client, eventId } = await setup()
    const { own, showBaraat } = await sets(eventId)
    expect((await post(`/ar-sets/${own.id}/notify-me`, asClient)).statusCode).toBe(204)
    expect((await post(`/ar-sets/${own.id}/notify-me`, asClient)).statusCode).toBe(204)
    expect((await post(`/ar-sets/${showBaraat.id}/notify-me`, asClient)).statusCode).toBe(422)
    expect((await get('/ar-sets', asClient)).json()[0].notifyRequested).toBe(true)

    await app.prisma.aRSet.update({ where: { id: own.id }, data: { status: 'READY' } })
    const deps = { db: app.prisma, mailer: app.sentMail, appUrl: 'http://app', log: app.log }
    expect(await notifySetReady(deps, own.id)).toBe(1)
    expect(app.sentMail.last(client.email)?.subject).toMatch(/ready to preview/)
    expect(await notifySetReady(deps, own.id)).toBe(0)
  })

  it('a session request reaches the consultant; other clients get 404', async () => {
    const { asClient, consultant, eventId } = await setup()
    const own = (await sets(eventId)).own
    const res = await post(`/events/${eventId}/ar/session-request`, asClient, { preferredDate: '2027-02-01', note: 'Evening please' })
    expect(res.statusCode).toBe(202)
    expect(res.json().consultantName).toBe('Ayesha Malik')
    expect(app.sentMail.last(consultant.email)?.text).toContain('2027-02-01')
    expect(await app.prisma.activityEntry.count({ where: { eventId, kind: 'AR' } })).toBe(1)

    const stranger = await signIn((await createUser(app.prisma)).email)
    expect((await get(`/ar-sets/${own.id}/assets`, stranger)).statusCode).toBe(404)
    expect((await post(`/events/${eventId}/ar/session-request`, stranger, {})).statusCode).toBe(404)
  })
})
