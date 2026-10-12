/**
 * Authorization matrix (docs/step-03-auth.md): every event-, client- and
 * thread-scoped route uses these helpers, so they are tested for each actor.
 * Expected: owner ✓ · other client 404 · assigned consultant ✓ · other consultant 404 · admin ✓.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, resetDb } from '../test/db'
import { createUser } from '../test/users'
import { AppError } from './errors'
import { assertClientAccess, assertEventAccess, assertThreadAccess } from './policy'

const db = createTestDb()
let actors: Record<'owner' | 'otherClient' | 'consultant' | 'otherConsultant' | 'admin', { id: string; role: 'CLIENT' | 'CONSULTANT' | 'ADMIN' }>
let eventId: string
let threadId: string
let ownerId: string

beforeAll(async () => {
  await resetDb(db)
  const consultant = await createUser(db, { role: 'CONSULTANT' })
  const otherConsultant = await createUser(db, { role: 'CONSULTANT' })
  const admin = await createUser(db, { role: 'ADMIN' })
  const owner = await createUser(db, { consultantId: consultant.id })
  const otherClient = await createUser(db, { consultantId: otherConsultant.id })
  actors = { owner, otherClient, consultant, otherConsultant, admin }
  ownerId = owner.id

  eventId = (await db.event.create({ data: { clientId: owner.id, name: 'Mehndi', type: 'MEHNDI' } })).id
  threadId = (
    await db.thread.create({
      data: { clientId: owner.id, title: 'Studio', participants: { create: [{ userId: owner.id }] } },
    })
  ).id
})
afterAll(async () => {
  await db.$disconnect()
})

const expected = {
  owner: 'allowed',
  otherClient: 'not-found',
  consultant: 'allowed',
  otherConsultant: 'not-found',
  admin: 'allowed',
} as const

async function outcome(fn: () => Promise<unknown>) {
  try {
    await fn()
    return 'allowed'
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 404) return 'not-found'
    throw err
  }
}

describe.each(Object.entries(expected))('%s', (actorName, result) => {
  const actor = () => actors[actorName as keyof typeof actors]

  it(`event access → ${result}`, async () => {
    expect(await outcome(() => assertEventAccess(db, actor(), eventId))).toBe(result)
  })

  it(`client access → ${result}`, async () => {
    expect(await outcome(() => assertClientAccess(db, actor(), ownerId))).toBe(result)
  })

  it(`thread access → ${result}`, async () => {
    expect(await outcome(() => assertThreadAccess(db, actor(), threadId))).toBe(result)
  })
})

it('treats malformed ids as not found (no 500s from bad UUIDs)', async () => {
  await expect(assertEventAccess(db, actors.admin, 'not-a-uuid')).rejects.toMatchObject({ statusCode: 404 })
  await expect(assertThreadAccess(db, actors.admin, '../etc')).rejects.toMatchObject({ statusCode: 404 })
})

it('hides soft-deleted events even from admins', async () => {
  const gone = await db.event.create({ data: { clientId: ownerId, name: 'Old', type: 'DINNER', deletedAt: new Date() } })
  await expect(assertEventAccess(db, actors.admin, gone.id)).rejects.toMatchObject({ statusCode: 404 })
})
