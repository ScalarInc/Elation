import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp } from '../../test/app'
import { resetDb } from '../../test/db'
import { createUser, TEST_PASSWORD } from '../../test/users'
import { ensureThreads } from '../../lib/threads'
import { SESSION_COOKIE } from './sessions'
import { expireLapsedClients } from './sweep'
import { dataDeletionDate, noticeStage, purgeExpiredClients, sendAccessNotices } from './retention'

type TestApp = Awaited<ReturnType<typeof buildTestApp>>
let app: TestApp

const DAY = 24 * 60 * 60 * 1000
const RETENTION = 7

beforeAll(async () => {
  app = await buildTestApp()
})
afterAll(async () => {
  await app.close()
})
beforeEach(async () => {
  await resetDb(app.prisma)
  app.sentMail.sent.length = 0
})

const notices = (now = new Date()) =>
  sendAccessNotices({ db: app.prisma, mailer: app.sentMail, appUrl: 'https://elation.test', retentionDays: RETENTION }, now)
const purge = (now = new Date()) => purgeExpiredClients({ db: app.prisma, storage: app.storage, retentionDays: RETENTION }, now)

async function signIn(email: string) {
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password: TEST_PASSWORD, remember: true } })
  expect(res.statusCode).toBe(200)
  return { [SESSION_COOKIE]: res.cookies.find((c) => c.name === SESSION_COOKIE)!.value }
}

/** A client with a bit of everything: event, questionnaire, moodboard, budget + quote, chat, files, notes. */
async function clientWithData(expiresAt: Date) {
  const db = app.prisma
  const consultant = await createUser(db, { role: 'CONSULTANT', name: 'Ayesha Malik' })
  const client = await createUser(db, { name: 'Malaika Khan', consultantId: consultant.id, accessExpiresAt: expiresAt })
  await db.user.update({ where: { id: client.id }, data: { phone: '+92 300 0000000', partnerName: 'Ahmed', city: 'Lahore' } })
  const event = await db.event.create({ data: { clientId: client.id, name: 'Mehndi', type: 'MEHNDI', guests: 200, status: 'ACTIVE' } })
  await db.questionnaireResponse.create({ data: { eventId: event.id, schemaVersion: 1, answers: { q2_name: 'Garden of Lights' } } })
  await db.questionnaireRevision.create({ data: { eventId: event.id, actorId: client.id, changes: [{ qid: 'q2_name', from: null, to: 'Garden of Lights' }] } })
  const item = await db.inventoryItem.create({ data: { sku: 'T-1', name: 'Velvet sofa', category: 'SOFA', colour: 'Blush', pricePkr: 50_000, unit: 'EACH' } })
  await db.moodboard.create({
    data: { eventId: event.id, generationId: event.id, variantLabel: 'A', title: 'Blush', status: 'SAVED', palette: [], controls: {}, generator: 'rules-v1' },
  })
  const plan = await db.budgetPlan.create({ data: { eventId: event.id, targetPkr: 1_000_000, seededFrom: 'blank' } })
  await db.budgetLine.create({ data: { planId: plan.id, category: 'Seating', inventoryItemId: item.id, qty: 2, unitPricePkr: 50_000, position: 0, source: 'client' } })
  await db.quoteRequest.create({ data: { planId: plan.id, snapshot: { totalPkr: 100_000 } } })
  await db.aRSet.create({ data: { eventId: event.id, eventType: 'MEHNDI', title: 'Mehndi set', theme: 'Garden', coverUrl: '/x.jpg', summary: 's' } })
  await ensureThreads(db, client.id)
  const thread = await db.thread.findFirstOrThrow({ where: { clientId: client.id, eventId: event.id } })
  const message = await db.message.create({ data: { threadId: thread.id, authorId: consultant.id, body: 'Here is the venue plan' } })
  await db.activityEntry.create({ data: { clientId: client.id, eventId: event.id, kind: 'EVENT', title: 'Event created' } })
  await db.consultantNote.create({ data: { clientId: client.id, authorId: consultant.id, body: 'Prefers blush' } })
  await db.consent.create({ data: { userId: client.id, version: 1, terms: true, dataUse: true, studioShare: true, marketing: false } })
  await db.inquiry.create({ data: { name: 'Malaika Khan', email: client.email, phone: '+92 300 0000000', message: 'Mehndi in March', status: 'CONVERTED', convertedUserId: client.id } })
  await db.auditLog.create({ data: { actorId: consultant.id, action: 'user.invite', targetType: 'User', targetId: client.id, after: { email: client.email } } })

  // A venue photo (with a processed preview) on the event, and a staff attachment in chat.
  const photo = await db.file.create({
    data: { ownerId: client.id, eventId: event.id, purpose: 'VENUE_MEDIA', bucket: 'private', key: `venue-media/${client.id}/a.jpg`, previewKey: `venue-media/${client.id}/a.w1600.webp`, filename: 'venue.jpg', mime: 'image/jpeg', sizeBytes: 3, status: 'READY' },
  })
  const attachment = await db.file.create({
    data: { ownerId: consultant.id, messageId: message.id, purpose: 'ATTACHMENT', bucket: 'private', key: `attachment/${consultant.id}/plan.pdf`, filename: 'plan.pdf', mime: 'application/pdf', sizeBytes: 3, status: 'READY' },
  })
  for (const key of [photo.key, photo.previewKey!, attachment.key]) await app.storage.put('private', key, Buffer.from('abc'), 'application/octet-stream')

  return { consultant, client, event, item, photo, attachment }
}

describe('access notices', () => {
  it('stages: a week out, a day out, ended', () => {
    const now = new Date('2026-10-15T12:00:00Z')
    expect(noticeStage(new Date(now.getTime() + 8 * DAY), false, now)).toBeNull()
    expect(noticeStage(new Date(now.getTime() + 6 * DAY), false, now)).toBe(7)
    expect(noticeStage(new Date(now.getTime() + 12 * 60 * 60 * 1000), false, now)).toBe(1)
    expect(noticeStage(new Date(now.getTime() - 1000), false, now)).toBe(0)
    expect(noticeStage(new Date(now.getTime() + 6 * DAY), true, now)).toBe(0)
  })

  it('emails a week before, a day before and when access ends — each once', async () => {
    const now = new Date()
    const consultant = await createUser(app.prisma, { role: 'CONSULTANT', name: 'Ayesha Malik' })
    const expires = new Date(now.getTime() + 6 * DAY)
    const client = await createUser(app.prisma, { name: 'Malaika Khan', consultantId: consultant.id, accessExpiresAt: expires })
    const farOff = await createUser(app.prisma, { accessExpiresAt: new Date(now.getTime() + 30 * DAY) })

    expect(await notices(now)).toBe(1)
    const week = app.sentMail.last(client.email)!
    expect(week.subject).toMatch(/access ends on/)
    expect(week.text).toContain('ask Ayesha Malik to extend')
    expect(week.text).toContain('7 days after your access ends')
    expect(app.sentMail.last(farOff.email)).toBeUndefined()

    expect(await notices(new Date(now.getTime() + DAY))).toBe(0) // still the 7-day stage: no repeat

    expect(await notices(new Date(expires.getTime() - 2 * 60 * 60 * 1000))).toBe(1)
    expect(app.sentMail.sent.filter((m) => m.to === client.email)).toHaveLength(2)

    const after = new Date(expires.getTime() + 1000)
    expect(await expireLapsedClients(app.prisma, after)).toBe(1)
    expect(await notices(after)).toBe(1)
    const ended = app.sentMail.last(client.email)!
    expect(ended.subject).toBe('Your Elation X access has ended')
    const deleteOn = dataDeletionDate(expires, RETENTION)
    expect(ended.text).toContain(new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Karachi' }).format(deleteOn))
    const toConsultant = app.sentMail.last(consultant.email)!
    expect(toConsultant.subject).toBe('Malaika Khan’s access has ended')
    expect(toConsultant.text).toContain(`/admin/clients/${client.id}`)

    expect(await notices(new Date(after.getTime() + DAY))).toBe(0)
  })

  it('starts over after an extension', async () => {
    const now = new Date()
    const client = await createUser(app.prisma, { accessExpiresAt: new Date(now.getTime() + 5 * DAY) })
    expect(await notices(now)).toBe(1)
    await app.prisma.user.update({ where: { id: client.id }, data: { accessExpiresAt: new Date(now.getTime() + 35 * DAY) } })
    expect(await notices(new Date(now.getTime() + 29 * DAY))).toBe(1)
  })

  it('a failed send is retried on the next sweep', async () => {
    const client = await createUser(app.prisma, { accessExpiresAt: new Date(Date.now() + 3 * DAY) })
    const failing = { send: async () => Promise.reject(new Error('provider down')) }
    expect(await sendAccessNotices({ db: app.prisma, mailer: failing, appUrl: 'https://elation.test', retentionDays: RETENTION })).toBe(0)
    expect((await app.prisma.user.findUniqueOrThrow({ where: { id: client.id } })).accessNoticeStage).toBeNull()
    expect(await notices()).toBe(1)
  })

  it('never emails staff, revoked clients or clients whose data is already gone', async () => {
    const soon = new Date(Date.now() + 2 * DAY)
    await createUser(app.prisma, { role: 'CONSULTANT', accessExpiresAt: soon })
    const revoked = await createUser(app.prisma, { accessExpiresAt: soon })
    await app.prisma.user.update({ where: { id: revoked.id }, data: { status: 'REVOKED' } })
    const longGone = await createUser(app.prisma, { accessExpiresAt: new Date(Date.now() - 30 * DAY) })
    await app.prisma.user.update({ where: { id: longGone.id }, data: { status: 'EXPIRED' } })
    expect(await notices()).toBe(0)
  })
})

describe('retention purge (owner answer A5)', () => {
  it('keeps everything until the retention period has passed', async () => {
    const { client } = await clientWithData(new Date(Date.now() - 6 * DAY))
    await expireLapsedClients(app.prisma)
    expect(await purge()).toEqual([])
    expect(await app.prisma.event.count({ where: { clientId: client.id } })).toBe(1)
  })

  it('deletes an expired client’s data after 7 days and anonymises the account', async () => {
    const db = app.prisma
    const { client, consultant, event, item, photo, attachment } = await clientWithData(new Date(Date.now() - 8 * DAY))
    await expireLapsedClients(db)

    const [result] = await purge()
    expect(result).toEqual({ userId: client.id, events: 1, files: 2, threads: 2 })

    expect(await db.event.count({ where: { clientId: client.id, deletedAt: {} } })).toBe(0)
    expect(await db.questionnaireResponse.count({ where: { eventId: event.id } })).toBe(0)
    expect(await db.questionnaireRevision.count({ where: { eventId: event.id } })).toBe(0)
    expect(await db.moodboard.count({ where: { eventId: event.id } })).toBe(0)
    expect(await db.budgetPlan.count({ where: { eventId: event.id } })).toBe(0)
    expect(await db.budgetLine.count()).toBe(0)
    expect(await db.quoteRequest.count()).toBe(0)
    expect(await db.aRSet.count({ where: { eventId: event.id } })).toBe(0)
    expect(await db.thread.count({ where: { clientId: client.id } })).toBe(0)
    expect(await db.message.count()).toBe(0)
    expect(await db.activityEntry.count({ where: { clientId: client.id } })).toBe(0)
    expect(await db.consultantNote.count({ where: { clientId: client.id } })).toBe(0)
    expect(await db.consent.count({ where: { userId: client.id } })).toBe(0)
    expect(await db.file.count({ where: { id: { in: [photo.id, attachment.id] }, deletedAt: {} } })).toBe(0)
    for (const key of [photo.key, photo.previewKey!, attachment.key]) expect(await app.storage.head('private', key)).toBeNull()

    const tombstone = await db.user.findUniqueOrThrow({ where: { id: client.id, deletedAt: {} } })
    expect(tombstone).toMatchObject({ name: 'Former client', phone: null, partnerName: null, city: null, passwordHash: null, consultantId: null })
    expect(tombstone.email).toBe(`purged-${client.id}@purged.invalid`)
    expect(tombstone.purgedAt).not.toBeNull()
    expect(tombstone.deletedAt).not.toBeNull()

    const inquiry = await db.inquiry.findFirstOrThrow()
    expect(inquiry).toMatchObject({ name: 'Former client', phone: null, message: null, convertedUserId: null })
    const invite = await db.auditLog.findFirstOrThrow({ where: { targetId: client.id, action: 'user.invite' } })
    expect(invite.after).toBeNull()
    expect(await db.auditLog.count({ where: { targetId: client.id, action: 'user.purged' } })).toBe(1)

    // Shared things stay: the consultant, the catalogue.
    expect(await db.user.count({ where: { id: consultant.id } })).toBe(1)
    expect(await db.inventoryItem.count({ where: { id: item.id } })).toBe(1)

    // Idempotent, and the email is free for a fresh start.
    expect(await purge()).toEqual([])
    const admin = await createUser(db, { role: 'ADMIN' })
    const reinvite = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/clients/invite',
      cookies: await signIn(admin.email),
      payload: { name: 'Malaika Khan', email: client.email, consultantId: consultant.id },
    })
    expect(reinvite.statusCode).toBe(201)
  })

  it('an extension before day 7 keeps everything', async () => {
    const db = app.prisma
    const { client, consultant } = await clientWithData(new Date(Date.now() - 3 * DAY))
    await expireLapsedClients(db)
    const res = await app.inject({ method: 'POST', url: `/api/v1/admin/clients/${client.id}/extend`, cookies: await signIn(consultant.email), payload: { days: 30 } })
    expect(res.statusCode).toBe(200)
    expect(res.json().dataDeletionAt).toBeNull()

    expect(await purge(new Date(Date.now() + 10 * DAY))).toEqual([])
    expect(await db.event.count({ where: { clientId: client.id } })).toBe(1)
  })

  it('never touches staff, active or revoked accounts', async () => {
    const old = new Date(Date.now() - 60 * DAY)
    const consultant = await createUser(app.prisma, { role: 'CONSULTANT', accessExpiresAt: old })
    await app.prisma.user.update({ where: { id: consultant.id }, data: { status: 'EXPIRED' } })
    const revoked = await createUser(app.prisma, { accessExpiresAt: old })
    await app.prisma.user.update({ where: { id: revoked.id }, data: { status: 'REVOKED' } })
    await createUser(app.prisma, { accessExpiresAt: old }) // ACTIVE, not swept yet
    expect(await purge()).toEqual([])
  })

  it('shows staff the deletion date of an expired client', async () => {
    const expires = new Date(Date.now() - 2 * DAY)
    const { client, consultant } = await clientWithData(expires)
    await expireLapsedClients(app.prisma)
    const res = await app.inject({ method: 'GET', url: `/api/v1/admin/clients/${client.id}`, cookies: await signIn(consultant.email) })
    expect(res.json().dataDeletionAt).toBe(dataDeletionDate(expires, RETENTION).toISOString())
  })
})
