import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp } from '../../test/app'
import { resetDb } from '../../test/db'
import { createUser } from '../../test/users'
import { bootstrapAdmin } from './bootstrap'

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

describe('first admin (create-admin CLI)', () => {
  it('invites an admin on an empty database; the link activates a non-expiring admin account', async () => {
    const { activationUrl } = await bootstrapAdmin(app.prisma, { email: 'Owner@ElationByFMH.com', name: 'Studio Owner', appUrl: 'https://elation.test/' })
    expect(activationUrl).toMatch(/^https:\/\/elation\.test\/auth\?mode=activate&code=/)
    const code = decodeURIComponent(new URL(activationUrl).searchParams.get('code')!)

    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/invite/accept', payload: { code, password: 'a long enough passphrase' } })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ email: 'owner@elationbyfmh.com', role: 'admin' })
    const admin = await app.prisma.user.findUniqueOrThrow({ where: { email: 'owner@elationbyfmh.com' } })
    expect(admin).toMatchObject({ status: 'ACTIVE', accessExpiresAt: null })
  })

  it('running it again before activation gives a fresh link and kills the old one', async () => {
    const first = await bootstrapAdmin(app.prisma, { email: 'owner@elation.test', name: 'Owner', appUrl: 'https://e.test' })
    await bootstrapAdmin(app.prisma, { email: 'owner@elation.test', name: 'Owner', appUrl: 'https://e.test' })
    const oldCode = new URL(first.activationUrl).searchParams.get('code')!
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/invite/accept', payload: { code: oldCode, password: 'a long enough passphrase' } })
    expect(res.statusCode).toBe(404)
  })

  it('refuses once an active admin exists, and never takes over another account', async () => {
    const client = await createUser(app.prisma, { email: 'client@elation.test' })
    await expect(bootstrapAdmin(app.prisma, { email: client.email, name: 'X Y', appUrl: 'https://e.test' })).rejects.toMatchObject({ code: 'ALREADY_EXISTS' })
    await createUser(app.prisma, { role: 'ADMIN' })
    await expect(bootstrapAdmin(app.prisma, { email: 'new@elation.test', name: 'New Admin', appUrl: 'https://e.test' })).rejects.toMatchObject({ code: 'ADMIN_EXISTS' })
  })
})
