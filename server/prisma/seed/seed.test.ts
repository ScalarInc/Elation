import argon2 from 'argon2'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, resetDb } from '../../src/test/db'
import { DEMO_PASSWORD, seed } from './seed'

const db = createTestDb()

async function counts() {
  return {
    users: await db.user.count(),
    events: await db.event.count(),
    questionnaires: await db.questionnaireResponse.count(),
    inventory: await db.inventoryItem.count(),
    moodboards: await db.moodboard.count(),
    tiles: await db.moodboardTile.count(),
    plans: await db.budgetPlan.count(),
    lines: await db.budgetLine.count(),
    inspirations: await db.inspiration.count(),
    arSets: await db.aRSet.count(),
    threads: await db.thread.count(),
    messages: await db.message.count(),
    activity: await db.activityEntry.count(),
  }
}

describe('seed', () => {
  beforeAll(async () => {
    await resetDb(db)
    await seed(db)
  }, 60_000)
  afterAll(async () => {
    await db.$disconnect()
  })

  it('loads the demo fixtures', async () => {
    expect(await counts()).toEqual({
      users: 4,
      events: 4,
      questionnaires: 3,
      inventory: 180, // 18 priced placeholders + 162 draft items from the scans
      moodboards: 3,
      tiles: 12,
      plans: 3,
      lines: 19,
      inspirations: 6,
      arSets: 3,
      threads: 2,
      messages: 6,
      activity: 4,
    })
  })

  it('is idempotent', async () => {
    const before = await counts()
    await seed(db)
    expect(await counts()).toEqual(before)
  }, 60_000)

  it('creates a demo client who can log in and has a consultant', async () => {
    const malaika = await db.user.findUniqueOrThrow({
      where: { email: 'malaika.khan@example.com' },
      include: { consultant: true },
    })
    expect(malaika.role).toBe('CLIENT')
    expect(malaika.consultant?.name).toBe('Ayesha Malik')
    expect(await argon2.verify(malaika.passwordHash!, DEMO_PASSWORD)).toBe(true)
  })

  it('prices budget lines from inventory and keeps the mock unread count', async () => {
    const noorPlan = await db.budgetPlan.findFirstOrThrow({
      where: { event: { name: 'Whispers of Noor' } },
      include: { lines: true },
    })
    const included = noorPlan.lines
      .filter((l) => l.included)
      .reduce((sum, l) => sum + l.unitPricePkr * l.qty, 0)
    expect(included).toBeGreaterThan(0)

    const client = await db.user.findUniqueOrThrow({ where: { email: 'malaika.khan@example.com' } })
    const p = await db.threadParticipant.findFirstOrThrow({
      where: { userId: client.id, lastReadMessageId: { not: null } },
    })
    const unread = await db.message.count({ where: { threadId: p.threadId, id: { gt: p.lastReadMessageId! } } })
    expect(unread).toBe(2)
  })
})
