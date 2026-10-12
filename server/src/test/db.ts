import 'dotenv/config'
import { createPrisma, type Db } from '../plugins/db'

export function testDatabaseUrl(): string {
  const url = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL
  if (!url) throw new Error('Set DATABASE_URL_TEST (see server/.env.example)')
  return url
}

export function createTestDb(): Db {
  return createPrisma(testDatabaseUrl())
}

/** Empty every application table (keeps the migrations table). */
export async function resetDb(db: Db) {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  if (tables.length === 0) return
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ')
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)
}

/** Minimal valid rows for tests that need a client and an event. */
export async function createClientWithEvent(db: Db, email = 'client@test.local') {
  const client = await db.user.create({
    data: { email, name: 'Test Client', role: 'CLIENT', status: 'ACTIVE' },
  })
  const event = await db.event.create({
    data: { clientId: client.id, name: 'Test Mehndi', type: 'MEHNDI', guests: 200 },
  })
  return { client, event }
}
