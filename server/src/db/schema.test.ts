/**
 * Repository-level tests for the Step 2 schema: the priority entities
 * (Users, Events, Questionnaires, Chat history, Budget) plus the constraints
 * that live outside schema.prisma (citext, partial unique index, soft delete).
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createClientWithEvent, createTestDb, resetDb } from '../test/db'

const db = createTestDb()

beforeEach(async () => {
  await resetDb(db)
})
afterAll(async () => {
  await db.$disconnect()
})

describe('User', () => {
  it('creates with defaults and generates a UUIDv7 id', async () => {
    const u = await db.user.create({ data: { email: 'a@test.local', name: 'A' } })
    expect(u.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/)
    expect(u.role).toBe('CLIENT')
    expect(u.status).toBe('INVITED')
    expect(u.notificationPrefs).toMatchObject({ consultantMessages: true, marketing: false })
  })

  it('treats emails case-insensitively (citext)', async () => {
    await db.user.create({ data: { email: 'Malaika@Test.local', name: 'M' } })
    await expect(db.user.findUnique({ where: { email: 'malaika@test.local' } })).resolves.not.toBeNull()
    await expect(db.user.create({ data: { email: 'MALAIKA@test.local', name: 'dup' } })).rejects.toThrow()
  })

  it('links a client to their consultant', async () => {
    const consultant = await db.user.create({ data: { email: 'c@test.local', name: 'C', role: 'CONSULTANT' } })
    await db.user.create({ data: { email: 'k@test.local', name: 'K', consultantId: consultant.id } })
    const withClients = await db.user.findUniqueOrThrow({ where: { id: consultant.id }, include: { clients: true } })
    expect(withClients.clients.map((c) => c.email)).toEqual(['k@test.local'])
  })

  it('hides soft-deleted users from reads, unless deletedAt is filtered explicitly', async () => {
    const u = await db.user.create({ data: { email: 'gone@test.local', name: 'Gone' } })
    await db.user.update({ where: { id: u.id }, data: { deletedAt: new Date() } })

    expect(await db.user.findUnique({ where: { id: u.id } })).toBeNull()
    expect(await db.user.count()).toBe(0)
    expect(await db.user.findMany({ where: { deletedAt: { not: null } } })).toHaveLength(1)
  })
})

describe('Event', () => {
  it('creates, reads and updates an event', async () => {
    const { client, event } = await createClientWithEvent(db)
    expect(event.status).toBe('DRAFT')

    const updated = await db.event.update({
      where: { id: event.id },
      data: { date: new Date('2026-12-14'), venueSetting: 'OUTDOOR', budgetPkr: 2_500_000 },
    })
    expect(updated.date?.toISOString().slice(0, 10)).toBe('2026-12-14')

    const mine = await db.event.findMany({ where: { clientId: client.id } })
    expect(mine).toHaveLength(1)
  })

  it('hides soft-deleted events', async () => {
    const { client, event } = await createClientWithEvent(db)
    await db.event.update({ where: { id: event.id }, data: { deletedAt: new Date() } })
    expect(await db.event.findMany({ where: { clientId: client.id } })).toHaveLength(0)
  })
})

describe('Questionnaire', () => {
  it('stores answers as JSON, versions saves, and keeps a revision log', async () => {
    const { event } = await createClientWithEvent(db)
    await db.questionnaireResponse.create({
      data: {
        eventId: event.id,
        schemaVersion: 1,
        answers: { q1_type: 'Mehndi', q10_aesthetic: ['Romantic', 'Soft'] },
        elationDecides: { q2_name: true },
      },
    })

    const saved = await db.questionnaireResponse.update({
      where: { eventId: event.id, version: 1 },
      data: {
        answers: { q1_type: 'Mehndi', q10_aesthetic: ['Romantic'], q4_guests: 320 },
        version: { increment: 1 },
        revisions: { create: { changes: [{ qid: 'q4_guests', from: null, to: 320 }] } },
      },
      include: { revisions: true },
    })
    expect(saved.version).toBe(2)
    expect(saved.answers).toMatchObject({ q4_guests: 320 })
    expect(saved.revisions).toHaveLength(1)

    // A stale version no longer matches → the optimistic-concurrency write fails.
    await expect(
      db.questionnaireResponse.update({ where: { eventId: event.id, version: 1 }, data: { percentComplete: 10 } }),
    ).rejects.toThrow()
  })

  it('supports JSON queries for analytics (GIN-indexed)', async () => {
    const { event } = await createClientWithEvent(db)
    await db.questionnaireResponse.create({
      data: { eventId: event.id, schemaVersion: 1, answers: { q10_aesthetic: ['Romantic', 'Regal'] } },
    })
    const rows = await db.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM "QuestionnaireResponse"
      WHERE answers @> '{"q10_aesthetic": ["Romantic"]}'`
    expect(Number(rows[0].n)).toBe(1)
  })
})

describe('Chat history', () => {
  it('orders messages by id (UUIDv7) and tracks read state per participant', async () => {
    const { client } = await createClientWithEvent(db)
    const consultant = await db.user.create({ data: { email: 'c@test.local', name: 'C', role: 'CONSULTANT' } })
    const thread = await db.thread.create({
      data: {
        clientId: client.id,
        title: 'Studio',
        participants: { create: [{ userId: client.id }, { userId: consultant.id }] },
      },
    })

    const first = await db.message.create({ data: { threadId: thread.id, authorId: consultant.id, body: 'Hello' } })
    const second = await db.message.create({ data: { threadId: thread.id, authorId: client.id, body: 'Hi!' } })
    await db.message.create({ data: { threadId: thread.id, kind: 'SYSTEM', body: 'Moodboard ready' } })

    const ordered = await db.message.findMany({ where: { threadId: thread.id }, orderBy: { id: 'asc' } })
    expect(ordered.map((m) => m.body)).toEqual(['Hello', 'Hi!', 'Moodboard ready'])
    expect(ordered[2].authorId).toBeNull()

    await db.threadParticipant.update({
      where: { threadId_userId: { threadId: thread.id, userId: client.id } },
      data: { lastReadMessageId: first.id, lastReadAt: new Date() },
    })
    const unread = await db.message.count({ where: { threadId: thread.id, id: { gt: first.id } } })
    expect(unread).toBe(2)
    expect(second.id > first.id).toBe(true)
  })
})

describe('Budget', () => {
  it('allows one plan per event and cascades lines on delete', async () => {
    const { event } = await createClientWithEvent(db)
    const item = await db.inventoryItem.create({
      data: { sku: 'CHR-1', name: 'Chiavari Gold', category: 'CHAIR', colour: 'Gold', pricePkr: 950, unit: 'EACH' },
    })
    const plan = await db.budgetPlan.create({
      data: {
        eventId: event.id,
        targetPkr: 2_500_000,
        seededFrom: 'blank',
        lines: {
          create: [
            { category: 'Seating', inventoryItemId: item.id, qty: 200, unitPricePkr: 950, position: 0, source: 'client' },
          ],
        },
      },
      include: { lines: true },
    })
    expect(plan.lines[0].unitPricePkr * plan.lines[0].qty).toBe(190_000)

    await expect(
      db.budgetPlan.create({ data: { eventId: event.id, targetPkr: 1, seededFrom: 'blank' } }),
    ).rejects.toThrow()

    await db.budgetPlan.delete({ where: { id: plan.id } })
    expect(await db.budgetLine.count()).toBe(0)
  })

  it('keeps the price snapshot when the inventory price changes', async () => {
    const { event } = await createClientWithEvent(db)
    const item = await db.inventoryItem.create({
      data: { sku: 'SOF-1', name: 'Sofa', category: 'SOFA', colour: 'Ivory', pricePkr: 45_000, unit: 'EACH' },
    })
    const plan = await db.budgetPlan.create({
      data: {
        eventId: event.id,
        targetPkr: 100_000,
        seededFrom: 'blank',
        lines: { create: [{ category: 'Stage', inventoryItemId: item.id, qty: 1, unitPricePkr: 45_000, position: 0, source: 'client' }] },
      },
    })
    await db.inventoryItem.update({ where: { id: item.id }, data: { pricePkr: 50_000 } })
    const line = await db.budgetLine.findFirstOrThrow({ where: { planId: plan.id }, include: { inventoryItem: true } })
    expect(line.unitPricePkr).toBe(45_000)
    expect(line.inventoryItem.pricePkr).toBe(50_000)
  })
})

describe('Moodboard', () => {
  it('allows only one primary moodboard per event (partial unique index)', async () => {
    const { event } = await createClientWithEvent(db)
    const base = {
      eventId: event.id,
      generationId: '0190a1b2-0000-7000-8000-000000000001',
      title: 'Concept',
      controls: {},
      generator: 'rules-v1',
    }
    await db.moodboard.create({ data: { ...base, variantLabel: 'A', isPrimary: true } })
    await db.moodboard.create({ data: { ...base, variantLabel: 'B', isPrimary: false } })
    await expect(db.moodboard.create({ data: { ...base, variantLabel: 'C', isPrimary: true } })).rejects.toThrow()
  })
})
