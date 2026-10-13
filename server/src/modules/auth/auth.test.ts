import { CONSENT_VERSION } from '@elation/shared/api'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp } from '../../test/app'
import { resetDb } from '../../test/db'
import { createUser, TEST_PASSWORD } from '../../test/users'
import { SESSION_COOKIE } from './sessions'
import { expireLapsedClients } from './sweep'

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
  app.sentMail.sent.length = 0
})

type Cookie = { name: string; value: string; maxAge?: number; httpOnly?: boolean; sameSite?: string }
function sessionCookie(res: { cookies: Cookie[] }) {
  return res.cookies.find((c) => c.name === SESSION_COOKIE)
}

async function login(email: string, password = TEST_PASSWORD, remember = true) {
  return app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password, remember } })
}

async function signIn(email: string) {
  const res = await login(email)
  expect(res.statusCode).toBe(200)
  return { [SESSION_COOKIE]: sessionCookie(res)!.value }
}

const linkFrom = (text: string, pattern: RegExp) => decodeURIComponent(text.match(pattern)![1])

describe('login / logout', () => {
  it('signs in with the right password, sets an httpOnly cookie, and returns Me', async () => {
    const consultant = await createUser(app.prisma, { role: 'CONSULTANT', name: 'Ayesha Malik' })
    const client = await createUser(app.prisma, { name: 'Malaika Khan', consultantId: consultant.id })

    const res = await login(client.email.toUpperCase()) // emails are case-insensitive
    expect(res.statusCode).toBe(200)
    const cookie = sessionCookie(res)!
    expect(cookie.httpOnly).toBe(true)
    expect(cookie.sameSite).toBe('Lax')
    expect(cookie.maxAge).toBeGreaterThan(0)
    expect(res.json()).toMatchObject({
      email: client.email,
      role: 'client',
      avatarInitials: 'MK',
      consultant: { name: 'Ayesha Malik', avatarInitials: 'AM' },
      consent: null,
    })

    const me = await app.inject({ method: 'GET', url: '/api/v1/me', cookies: { [SESSION_COOKIE]: cookie.value } })
    expect(me.statusCode).toBe(200)

    const out = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', cookies: { [SESSION_COOKIE]: cookie.value } })
    expect(out.statusCode).toBe(204)
    const after = await app.inject({ method: 'GET', url: '/api/v1/me', cookies: { [SESSION_COOKIE]: cookie.value } })
    expect(after.statusCode).toBe(401)
  })

  it('gives the same error for a wrong password and an unknown email', async () => {
    const client = await createUser(app.prisma)
    const wrong = await login(client.email, 'not the password')
    const unknown = await login('nobody@test.local')
    expect(wrong.statusCode).toBe(401)
    expect(unknown.statusCode).toBe(401)
    expect(wrong.json()).toEqual(unknown.json())
    expect(wrong.json().error.code).toBe('INVALID_CREDENTIALS')
  })

  it('"remember me" off issues a browser-session cookie', async () => {
    const client = await createUser(app.prisma)
    const res = await login(client.email, TEST_PASSWORD, false)
    expect(sessionCookie(res)!.maxAge).toBeUndefined()
    const session = await app.prisma.session.findFirstOrThrow({ where: { userId: client.id } })
    expect(session.persistent).toBe(false)
  })

  it('requires a session for /me', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/me' })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('UNAUTHENTICATED')
  })

  it('throttles repeated logins for one email', async () => {
    const throttled = await buildTestApp({ LOGIN_MAX_PER_EMAIL: '3' })
    try {
      const codes: number[] = []
      for (let i = 0; i < 4; i++) {
        const res = await throttled.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          payload: { email: 'target@test.local', password: 'guess' },
        })
        codes.push(res.statusCode)
      }
      expect(codes).toEqual([401, 401, 401, 429])
    } finally {
      await throttled.close()
    }
  })
})

describe('access expiry and revocation', () => {
  it('ends the session on the next request once access has expired', async () => {
    const client = await createUser(app.prisma)
    const cookies = await signIn(client.email)

    await app.prisma.user.update({ where: { id: client.id }, data: { accessExpiresAt: new Date(Date.now() - 1000) } })

    const res = await app.inject({ method: 'GET', url: '/api/v1/me', cookies })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('ACCESS_EXPIRED')
    expect(await app.prisma.session.count({ where: { userId: client.id } })).toBe(0)
    expect((await app.prisma.user.findUniqueOrThrow({ where: { id: client.id } })).status).toBe('EXPIRED')

    const again = await login(client.email)
    expect(again.statusCode).toBe(403)
    expect(again.json().error.code).toBe('ACCESS_EXPIRED')
  })

  it('ends the session on the next request once an admin revokes access', async () => {
    const client = await createUser(app.prisma)
    const cookies = await signIn(client.email)
    await app.prisma.user.update({ where: { id: client.id }, data: { status: 'REVOKED' } })

    const res = await app.inject({ method: 'GET', url: '/api/v1/me', cookies })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('ACCESS_REVOKED')
  })

  it('never expires staff accounts', async () => {
    const admin = await createUser(app.prisma, { role: 'ADMIN', accessExpiresAt: new Date(Date.now() - 1000) })
    expect((await login(admin.email)).statusCode).toBe(200)
  })

  it('the hourly sweep marks lapsed clients expired and kills their sessions', async () => {
    const lapsed = await createUser(app.prisma)
    const fine = await createUser(app.prisma)
    await signIn(lapsed.email)
    await app.prisma.user.update({ where: { id: lapsed.id }, data: { accessExpiresAt: new Date(Date.now() - 1000) } })

    expect(await expireLapsedClients(app.prisma)).toBe(1)
    expect((await app.prisma.user.findUniqueOrThrow({ where: { id: lapsed.id } })).status).toBe('EXPIRED')
    expect((await app.prisma.user.findUniqueOrThrow({ where: { id: fine.id } })).status).toBe('ACTIVE')
    expect(await app.prisma.session.count({ where: { userId: lapsed.id } })).toBe(0)
  })
})

describe('invitations', () => {
  it('admin invites → client looks up the code → activates → is signed in with 90 days of access', async () => {
    const consultant = await createUser(app.prisma, { role: 'CONSULTANT', name: 'Ayesha Malik' })
    const staff = await signIn(consultant.email)

    const invite = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/clients/invite',
      cookies: staff,
      payload: { name: 'Zara Ahmed', email: 'Zara@Test.local' },
    })
    expect(invite.statusCode).toBe(201)
    const { activationUrl } = invite.json()
    expect(activationUrl).toContain('/auth?mode=activate&code=')

    const mail = app.sentMail.last('zara@test.local')!
    expect(mail.subject).toContain('studio')
    const code = linkFrom(mail.text, /code=([^\s&]+)/)

    const lookup = await app.inject({ method: 'GET', url: `/api/v1/auth/invite/${encodeURIComponent(code)}` })
    expect(lookup.json()).toEqual({ email: 'zara@test.local', name: 'Zara Ahmed', consultantName: 'Ayesha Malik' })

    const accept = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/invite/accept',
      payload: { code, password: 'a lovely mehndi evening' },
    })
    expect(accept.statusCode).toBe(200)
    expect(sessionCookie(accept)).toBeDefined()
    const me = accept.json()
    expect(me.consultant.name).toBe('Ayesha Malik')
    const days = (new Date(me.accessExpiresAt).getTime() - Date.now()) / 86_400_000
    expect(Math.round(days)).toBe(90)

    // Single use.
    const reuse = await app.inject({ method: 'GET', url: `/api/v1/auth/invite/${encodeURIComponent(code)}` })
    expect(reuse.statusCode).toBe(404)
    expect(reuse.json().error.code).toBe('INVITE_INVALID')

    expect(await app.prisma.auditLog.count({ where: { action: 'user.invite' } })).toBe(1)
  })

  it('re-inviting replaces the earlier code', async () => {
    const admin = await createUser(app.prisma, { role: 'ADMIN' })
    const staff = await signIn(admin.email)
    const send = () =>
      app.inject({ method: 'POST', url: '/api/v1/admin/clients/invite', cookies: staff, payload: { name: 'Sana', email: 'sana@test.local' } })

    await send()
    const first = linkFrom(app.sentMail.last()!.text, /code=([^\s&]+)/)
    await send()
    const second = linkFrom(app.sentMail.last()!.text, /code=([^\s&]+)/)

    expect((await app.inject({ method: 'GET', url: `/api/v1/auth/invite/${encodeURIComponent(first)}` })).statusCode).toBe(404)
    expect((await app.inject({ method: 'GET', url: `/api/v1/auth/invite/${encodeURIComponent(second)}` })).statusCode).toBe(200)
  })

  it('rejects inviting an email that already has an account', async () => {
    const admin = await createUser(app.prisma, { role: 'ADMIN' })
    const existing = await createUser(app.prisma)
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/clients/invite',
      cookies: await signIn(admin.email),
      payload: { name: 'Dup', email: existing.email },
    })
    expect(res.statusCode).toBe(409)
  })

  it('clients cannot invite', async () => {
    const client = await createUser(app.prisma)
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/clients/invite',
      cookies: await signIn(client.email),
      payload: { name: 'X', email: 'x@test.local' },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('FORBIDDEN')
  })

  it('rejects a common password on activation', async () => {
    const admin = await createUser(app.prisma, { role: 'ADMIN' })
    await app.inject({
      method: 'POST',
      url: '/api/v1/admin/clients/invite',
      cookies: await signIn(admin.email),
      payload: { name: 'Hina', email: 'hina@test.local' },
    })
    const code = linkFrom(app.sentMail.last()!.text, /code=([^\s&]+)/)
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/invite/accept', payload: { code, password: 'password123' } })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('PASSWORD_TOO_COMMON')
  })
})

describe('passwords', () => {
  it('forgot → emailed link → reset ends old sessions and the new password works', async () => {
    const client = await createUser(app.prisma)
    const oldSession = await signIn(client.email)

    const forgot = await app.inject({ method: 'POST', url: '/api/v1/auth/password/forgot', payload: { email: client.email } })
    expect(forgot.statusCode).toBe(204)
    const token = linkFrom(app.sentMail.last(client.email)!.text, /token=([^\s&]+)/)

    const reset = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password/reset',
      payload: { token, password: 'a brand new secret' },
    })
    expect(reset.statusCode).toBe(204)

    expect((await app.inject({ method: 'GET', url: '/api/v1/me', cookies: oldSession })).statusCode).toBe(401)
    expect((await login(client.email, 'a brand new secret')).statusCode).toBe(200)

    const reuse = await app.inject({ method: 'POST', url: '/api/v1/auth/password/reset', payload: { token, password: 'yet another secret' } })
    expect(reuse.json().error.code).toBe('RESET_TOKEN_INVALID')
  })

  it('forgot-password does not reveal whether an email exists', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/password/forgot', payload: { email: 'ghost@test.local' } })
    expect(res.statusCode).toBe(204)
    expect(app.sentMail.sent).toHaveLength(0)
  })

  it('change password checks the current one and signs out other sessions', async () => {
    const client = await createUser(app.prisma)
    const here = await signIn(client.email)
    const elsewhere = await signIn(client.email)

    const wrong = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password/change',
      cookies: here,
      payload: { currentPassword: 'nope', newPassword: 'something much longer' },
    })
    expect(wrong.statusCode).toBe(400)
    expect(wrong.json().error.code).toBe('CURRENT_PASSWORD_INCORRECT')

    const ok = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password/change',
      cookies: here,
      payload: { currentPassword: TEST_PASSWORD, newPassword: 'something much longer' },
    })
    expect(ok.statusCode).toBe(204)
    expect((await app.inject({ method: 'GET', url: '/api/v1/me', cookies: here })).statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: '/api/v1/me', cookies: elsewhere })).statusCode).toBe(401)
  })
})

describe('/me', () => {
  it('updates profile and notification preferences', async () => {
    const client = await createUser(app.prisma)
    const cookies = await signIn(client.email)

    const profile = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      cookies,
      payload: { name: 'Malaika Raza', city: 'Lahore', clientRole: 'Bride', partnerName: '' },
    })
    expect(profile.statusCode).toBe(200)
    expect(profile.json()).toMatchObject({ name: 'Malaika Raza', city: 'Lahore', clientRole: 'Bride', partnerName: null, avatarInitials: 'MR' })

    const prefs = await app.inject({ method: 'PATCH', url: '/api/v1/me/notifications', cookies, payload: { weeklyDigest: true } })
    expect(prefs.json().notifications).toMatchObject({ weeklyDigest: true, consultantMessages: true })
  })

  it('records consent for the current terms version', async () => {
    const client = await createUser(app.prisma)
    const cookies = await signIn(client.email)
    const payload = { version: CONSENT_VERSION, terms: true, dataUse: true, studioShare: true, marketing: false }

    const res = await app.inject({ method: 'POST', url: '/api/v1/me/consent', cookies, payload })
    expect(res.json().consent.version).toBe(CONSENT_VERSION)

    const stale = await app.inject({ method: 'POST', url: '/api/v1/me/consent', cookies, payload: { ...payload, version: 99 } })
    expect(stale.statusCode).toBe(409)

    const missingRequired = await app.inject({ method: 'POST', url: '/api/v1/me/consent', cookies, payload: { ...payload, dataUse: false } })
    expect(missingRequired.statusCode).toBe(400)
  })

  it('lists sessions, signs out other sessions, and marks the current one', async () => {
    const client = await createUser(app.prisma)
    const here = await signIn(client.email)
    const elsewhere = await signIn(client.email)

    const list = await app.inject({ method: 'GET', url: '/api/v1/me/sessions', cookies: here })
    expect(list.json()).toHaveLength(2)
    expect(list.json().filter((s: { current: boolean }) => s.current)).toHaveLength(1)

    await app.inject({ method: 'POST', url: '/api/v1/auth/logout-others', cookies: here })
    expect((await app.inject({ method: 'GET', url: '/api/v1/me', cookies: elsewhere })).statusCode).toBe(401)
    expect((await app.inject({ method: 'GET', url: '/api/v1/me', cookies: here })).statusCode).toBe(200)
  })

  it('exports data without secrets, and records deletion requests once', async () => {
    const client = await createUser(app.prisma)
    const cookies = await signIn(client.email)

    const exported = await app.inject({ method: 'GET', url: '/api/v1/me/export', cookies })
    expect(exported.statusCode).toBe(200)
    expect(exported.headers['content-disposition']).toContain('attachment')
    expect(exported.body).not.toContain('passwordHash')
    expect(exported.json().profile.email).toBe(client.email)

    for (let i = 0; i < 2; i++) {
      const res = await app.inject({ method: 'POST', url: '/api/v1/me/deletion-request', cookies, payload: { reason: 'Event is over' } })
      expect(res.statusCode).toBe(202)
    }
    expect(await app.prisma.auditLog.count({ where: { action: 'user.deletion-requested' } })).toBe(1)
  })
})

describe('CSRF origin check', () => {
  it('rejects state-changing requests from another origin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: 'https://evil.example' },
      payload: { email: 'a@test.local', password: 'x' },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('BAD_ORIGIN')
  })

  it('allows the web app origin', async () => {
    const client = await createUser(app.prisma)
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: app.config.WEB_ORIGIN },
      payload: { email: client.email, password: TEST_PASSWORD },
    })
    expect(res.statusCode).toBe(200)
  })
})
