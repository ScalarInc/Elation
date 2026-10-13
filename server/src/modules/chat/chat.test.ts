import type { ServerSocketMessage } from '@elation/shared/api'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { WebSocket } from 'ws'
import { buildTestApp } from '../../test/app'
import { resetDb } from '../../test/db'
import { createUser, TEST_PASSWORD } from '../../test/users'
import { SESSION_COOKIE } from '../auth/sessions'
import { DIGEST_AFTER_MS, sendUnreadDigests } from './digest'

type TestApp = Awaited<ReturnType<typeof buildTestApp>>
let app: TestApp

beforeAll(async () => {
  app = await buildTestApp({ LOGIN_MAX_PER_IP: '1000' })
  await app.realtime.ready()
})
afterAll(async () => {
  await app.close()
})
beforeEach(async () => {
  await resetDb(app.prisma)
  app.sentMail.sent.length = 0
})

async function signIn(email: string) {
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password: TEST_PASSWORD } })
  return { [SESSION_COOKIE]: res.cookies.find((c) => c.name === SESSION_COOKIE)!.value }
}

const get = (url: string, cookies: Record<string, string>) => app.inject({ method: 'GET', url: `/api/v1${url}`, cookies })
const post = (url: string, cookies: Record<string, string>, payload: object = {}) =>
  app.inject({ method: 'POST', url: `/api/v1${url}`, cookies, payload })

async function setup() {
  const consultant = await createUser(app.prisma, { role: 'CONSULTANT', name: 'Ayesha Malik' })
  const client = await createUser(app.prisma, { consultantId: consultant.id, name: 'Malaika Khan' })
  const [asClient, asConsultant] = await Promise.all([signIn(client.email), signIn(consultant.email)])
  const event = (
    await post('/events', asClient, {
      type: 'Mehndi',
      concept: 'Whispers of Noor',
      date: '2027-03-14',
      guests: 250,
      venueName: 'Lawn',
      city: 'Lahore',
      venueSetting: 'Outdoor',
    })
  ).json()
  return { client, consultant, asClient, asConsultant, eventId: event.id as string }
}

let seq = 0
const cid = () => `test-${Date.now()}-${++seq}`

function socket(cookies: Record<string, string>) {
  const received: ServerSocketMessage[] = []
  const cookie = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')
  return app
    .injectWS('/api/v1/ws', { headers: { cookie } })
    .then((ws: WebSocket) => {
      ws.on('message', (raw) => received.push(JSON.parse(String(raw))))
      return { ws, received }
    })
}

async function waitFor<T>(fn: () => T | undefined, ms = 3000): Promise<T> {
  const until = Date.now() + ms
  for (;;) {
    const v = fn()
    if (v) return v
    if (Date.now() > until) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 20))
  }
}

describe('threads', () => {
  it('gives each client a general thread and one per event, with their consultant', async () => {
    const { asClient, asConsultant, client, eventId } = await setup()
    const threads = (await get('/threads', asClient)).json()
    expect(threads.map((t: { title: string }) => t.title).sort()).toEqual(['Elation Studio', 'Whispers of Noor · Mehndi'])
    const eventThread = threads.find((t: { eventId: string | null }) => t.eventId === eventId)
    expect(eventThread.participants.map((p: { role: string }) => p.role).sort()).toEqual(['client', 'consultant'])

    const staff = (await get('/threads', asConsultant)).json()
    expect(staff).toHaveLength(2)
    expect(staff[0].clientName).toBe(client.name)
  })

  it('creates the general thread when an invite is accepted', async () => {
    const consultant = await createUser(app.prisma, { role: 'CONSULTANT' })
    const asConsultant = await signIn(consultant.email)
    const invite = await post('/admin/clients/invite', asConsultant, { name: 'New Client', email: 'new@test.local', consultantId: consultant.id })
    expect(invite.statusCode).toBe(201)
    const code = new URL(invite.json().activationUrl).searchParams.get('code')!
    const accept = await post('/auth/invite/accept', {}, { code, password: 'a lovely mehndi evening' })
    expect(accept.statusCode).toBe(200)
    const threads = await app.prisma.thread.findMany({ include: { participants: true } })
    expect(threads).toHaveLength(1)
    expect(threads[0].participants.map((p) => p.userId).sort()).toEqual([accept.json().id, consultant.id].sort())
  })

  it("keeps other people's threads out of reach", async () => {
    const { asClient } = await setup()
    const other = await createUser(app.prisma)
    const asOther = await signIn(other.email)
    const [thread] = (await get('/threads', asClient)).json()
    expect((await get(`/threads/${thread.id}/messages`, asOther)).statusCode).toBe(404)
    expect((await post(`/threads/${thread.id}/messages`, asOther, { body: 'hi', clientMessageId: cid() })).statusCode).toBe(404)
    const stranger = await createUser(app.prisma, { role: 'CONSULTANT' })
    expect((await get(`/threads/${thread.id}/messages`, await signIn(stranger.email))).statusCode).toBe(404)
  })
})

describe('inbox rules', () => {
  it("doesn't badge system notes and hides threads of archived events", async () => {
    const { asClient, client, eventId } = await setup()
    const thread = await app.prisma.thread.findFirstOrThrow({ where: { eventId } })
    await app.prisma.message.create({ data: { threadId: thread.id, kind: 'SYSTEM', body: 'Elation curated 3 new concepts.' } })
    expect((await get('/unread-count', asClient)).json().unread).toBe(0)
    expect((await get('/threads', asClient)).json().find((t: { id: string }) => t.id === thread.id).lastMessage.body).toBe('Elation curated 3 new concepts.')

    await app.prisma.event.update({ where: { id: eventId }, data: { status: 'ARCHIVED' } })
    const threads = (await get('/threads', asClient)).json()
    expect(threads.map((t: { id: string }) => t.id)).not.toContain(thread.id)
    expect(await app.prisma.thread.count({ where: { clientId: client.id } })).toBe(2) // kept, not re-created
  })
})

describe('messages', () => {
  it('sends, pages newest-first and counts unread for the other side', async () => {
    const { asClient, asConsultant } = await setup()
    const general = (await get('/threads', asClient)).json().find((t: { eventId: null }) => t.eventId === null)
    for (let i = 1; i <= 5; i++) {
      const res = await post(`/threads/${general.id}/messages`, asClient, { body: `Message ${i}`, clientMessageId: cid() })
      expect(res.statusCode).toBe(201)
    }
    const page1 = (await get(`/threads/${general.id}/messages?limit=3`, asConsultant)).json()
    expect(page1.messages.map((m: { body: string }) => m.body)).toEqual(['Message 5', 'Message 4', 'Message 3'])
    const page2 = (await get(`/threads/${general.id}/messages?limit=3&before=${page1.nextBefore}`, asConsultant)).json()
    expect(page2.messages.map((m: { body: string }) => m.body)).toEqual(['Message 2', 'Message 1'])
    expect(page2.nextBefore).toBeNull()

    expect((await get('/unread-count', asConsultant)).json().unread).toBe(5)
    expect((await get('/unread-count', asClient)).json().unread).toBe(0)

    const read = await post(`/threads/${general.id}/read`, asConsultant, { messageId: page1.messages[1].id })
    expect(read.statusCode).toBe(204)
    expect((await get('/unread-count', asConsultant)).json().unread).toBe(1)
    // An older read can't move the pointer back.
    await post(`/threads/${general.id}/read`, asConsultant, { messageId: page2.messages[1].id })
    expect((await get('/unread-count', asConsultant)).json().unread).toBe(1)
    const threads = (await get('/threads', asClient)).json()
    const staffSide = threads.find((t: { id: string }) => t.id === general.id).participants.find((p: { role: string }) => p.role === 'consultant')
    expect(staffSide.lastReadMessageId).toBe(page1.messages[1].id)
  })

  it('treats a retried clientMessageId as the same message', async () => {
    const { asClient } = await setup()
    const [thread] = (await get('/threads', asClient)).json()
    const id = cid()
    const a = await post(`/threads/${thread.id}/messages`, asClient, { body: 'Hello', clientMessageId: id })
    const b = await post(`/threads/${thread.id}/messages`, asClient, { body: 'Hello', clientMessageId: id })
    expect(b.json().id).toBe(a.json().id)
    expect(await app.prisma.message.count({ where: { kind: 'USER' } })).toBe(1)
  })

  it('rejects empty, oversized and attachment messages', async () => {
    const { asClient } = await setup()
    const [thread] = (await get('/threads', asClient)).json()
    expect((await post(`/threads/${thread.id}/messages`, asClient, { body: '   ', clientMessageId: cid() })).statusCode).toBe(400)
    expect((await post(`/threads/${thread.id}/messages`, asClient, { body: 'x'.repeat(4001), clientMessageId: cid() })).statusCode).toBe(400)
    const att = await post(`/threads/${thread.id}/messages`, asClient, {
      body: 'see file',
      clientMessageId: cid(),
      attachmentFileIds: ['0192f000-0000-7000-8000-000000000000'],
    })
    expect(att.statusCode).toBe(422)
  })

  it('lets an admin read without joining, and join on first reply', async () => {
    const { asClient } = await setup()
    const admin = await createUser(app.prisma, { role: 'ADMIN' })
    const asAdmin = await signIn(admin.email)
    const [thread] = (await get('/threads', asClient)).json()
    expect((await get(`/threads/${thread.id}/messages`, asAdmin)).statusCode).toBe(200)
    expect(await app.prisma.threadParticipant.count({ where: { userId: admin.id } })).toBe(0)
    await post(`/threads/${thread.id}/messages`, asAdmin, { body: 'Elation here', clientMessageId: cid() })
    expect(await app.prisma.threadParticipant.count({ where: { userId: admin.id } })).toBe(1)
  })
})

describe('system messages', () => {
  it('posts to the event thread when Elation curates the first concepts and when a client asks about a piece', async () => {
    const { asClient, eventId } = await setup()
    await app.prisma.inventoryItem.create({
      data: { sku: 'ARCH', name: 'Ivory Curve Arch', category: 'BACKDROP', colour: 'Ivory', unit: 'EACH', pricePkr: 1000, tags: ['stage'], imageUrl: '/a.jpg' },
    })
    const gen = await post(`/events/${eventId}/moodboards/generate`, asClient, {})
    expect(gen.statusCode).toBe(201)
    const thread = await app.prisma.thread.findFirstOrThrow({ where: { eventId } })
    const system = await app.prisma.message.findMany({ where: { threadId: thread.id, kind: 'SYSTEM' } })
    expect(system.map((m) => m.body)).toEqual([expect.stringMatching(/^Elation curated .* for Whispers of Noor\.$/)])

    // A regenerate doesn't post again.
    await post(`/events/${eventId}/moodboards/generate`, asClient, {})
    expect(await app.prisma.message.count({ where: { threadId: thread.id, kind: 'SYSTEM' } })).toBe(1)

    const board = gen.json().concepts.find((c: { tileItems: unknown[] }) => c.tileItems.length > 0)
    const consult = await post(`/moodboards/${board.id}/tiles/${board.tileItems[0].id}/consult`, asClient, { note: 'Something warmer?' })
    expect(consult.statusCode, consult.body).toBeLessThan(300)
    const last = await app.prisma.message.findFirstOrThrow({ where: { threadId: thread.id }, orderBy: { id: 'desc' } })
    expect(last.body).toBe('Malaika asked for an alternative to Ivory Curve Arch. “Something warmer?”')
  })
})

describe('activity', () => {
  it('lists the client feed newest first, by event, and scoped for staff', async () => {
    const { asClient, asConsultant, eventId, client } = await setup()
    await app.prisma.activityEntry.create({ data: { clientId: client.id, kind: 'NOTE', title: 'Consultant note shared' } })
    const feed = (await get('/activity', asClient)).json()
    expect(feed.entries.map((e: { title: string }) => e.title)).toEqual(['Consultant note shared', 'Whispers of Noor created'])
    expect(feed.entries[1]).toMatchObject({ kind: 'event', eventId })

    const forEvent = (await get(`/activity?eventId=${eventId}`, asClient)).json()
    expect(forEvent.entries).toHaveLength(1)
    const paged = (await get('/activity?limit=1', asClient)).json()
    expect(paged.nextCursor).not.toBeNull()
    expect((await get(`/activity?limit=1&cursor=${paged.nextCursor}`, asClient)).json().entries[0].title).toBe('Whispers of Noor created')

    expect((await get('/activity', asConsultant)).json().entries).toHaveLength(2)
    const stranger = await createUser(app.prisma, { role: 'CONSULTANT' })
    const asStranger = await signIn(stranger.email)
    expect((await get('/activity', asStranger)).json().entries).toHaveLength(0)
    expect((await get(`/activity?clientId=${client.id}`, asStranger)).statusCode).toBe(404)
  })
})

describe('realtime', () => {
  it('pushes new messages, typing and read receipts to the other side', async () => {
    const { asClient, asConsultant, consultant } = await setup()
    const [thread] = (await get('/threads', asClient)).json()
    const clientWs = await socket(asClient)
    const staffWs = await socket(asConsultant)

    const sent = (await post(`/threads/${thread.id}/messages`, asClient, { body: 'Assalamu Alaikum', clientMessageId: cid() })).json()
    const created = await waitFor(() => staffWs.received.find((m) => m.type === 'message.created'))
    expect(created).toMatchObject({ threadId: thread.id, message: { id: sent.id, body: 'Assalamu Alaikum' } })
    // The sender's own tab hears it too (reconciles the optimistic copy).
    await waitFor(() => clientWs.received.find((m) => m.type === 'message.created'))

    staffWs.ws.send(JSON.stringify({ type: 'typing', threadId: thread.id }))
    const typing = await waitFor(() => clientWs.received.find((m) => m.type === 'typing'))
    expect(typing).toMatchObject({ userId: consultant.id, name: 'Ayesha' })
    expect(staffWs.received.some((m) => m.type === 'typing')).toBe(false)

    staffWs.ws.send(JSON.stringify({ type: 'read', threadId: thread.id, messageId: sent.id }))
    const read = await waitFor(() => clientWs.received.find((m) => m.type === 'message.read'))
    expect(read).toMatchObject({ userId: consultant.id, messageId: sent.id })

    clientWs.ws.terminate()
    staffWs.ws.terminate()
  })

  it('pushes activity entries and keeps other clients out', async () => {
    const { asClient, client } = await setup()
    const other = await createUser(app.prisma)
    const mine = await socket(asClient)
    const theirs = await socket(await signIn(other.email))
    await app.prisma.activityEntry.create({ data: { clientId: client.id, kind: 'BUDGET', title: 'Quote requested' } })
    const entry = await waitFor(() => mine.received.find((m) => m.type === 'activity.created'))
    expect(entry).toMatchObject({ entry: { title: 'Quote requested', kind: 'budget' } })
    await new Promise((r) => setTimeout(r, 150))
    expect(theirs.received).toHaveLength(0)
    mine.ws.terminate()
    theirs.ws.terminate()
  })

  it('refuses sockets without a session or from another origin', async () => {
    await expect(app.injectWS('/api/v1/ws')).rejects.toThrow()
    const { asClient } = await setup()
    const cookie = `${SESSION_COOKIE}=${asClient[SESSION_COOKIE]}`
    await expect(app.injectWS('/api/v1/ws', { headers: { cookie, origin: 'https://evil.example' } })).rejects.toThrow()
  })

  it('closes the socket of a client whose access has ended', async () => {
    const { asClient, client } = await setup()
    const s = await socket(asClient)
    const closed = new Promise<number>((r) => s.ws.on('close', (code) => r(code)))
    await app.prisma.user.update({ where: { id: client.id }, data: { accessExpiresAt: new Date(Date.now() - 1000) } })
    expect(await app.realtime.recheckSessions()).toBe(1)
    expect(await closed).toBe(4003)
  })
})

describe('unread digest', () => {
  it('emails offline people once, after ten minutes, unless they opted out', async () => {
    const { asConsultant, client } = await setup()
    const [thread] = (await get('/threads', asConsultant)).json()
    await post(`/threads/${thread.id}/messages`, asConsultant, { body: 'Your moodboard is ready to review', clientMessageId: cid() })
    const deps = { db: app.prisma, mailer: app.sentMail, config: app.config, isOnline: () => false }

    expect(await sendUnreadDigests(deps)).toBe(0) // too soon
    const later = new Date(Date.now() + DIGEST_AFTER_MS + 1000)
    expect(await sendUnreadDigests({ ...deps, isOnline: (id) => id === client.id }, later)).toBe(0) // online
    expect(await sendUnreadDigests(deps, later)).toBe(1)
    expect(app.sentMail.sent.at(-1)).toMatchObject({ to: client.email, subject: '1 unread message in Elation X' })
    expect(await sendUnreadDigests(deps, later)).toBe(0) // only once

    await app.prisma.user.update({ where: { id: client.id }, data: { notificationPrefs: { consultantMessages: false } } })
    await post(`/threads/${thread.id}/messages`, asConsultant, { body: 'One more thing', clientMessageId: cid() })
    expect(await sendUnreadDigests(deps, new Date(Date.now() + DIGEST_AFTER_MS + 1000))).toBe(0)
  })
})
