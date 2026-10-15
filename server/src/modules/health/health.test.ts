import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp } from '../../test/app'

describe('health', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>

  beforeAll(async () => {
    app = await buildTestApp()
  })
  afterAll(async () => {
    await app.close()
  })

  it('GET /api/v1/healthz → ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/healthz' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
  })

  it('GET /api/v1/readyz → database up', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/readyz' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true, checks: { database: 'up' } })
  })

  it('unknown API route → 404 with error shape', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/nope' })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({
      error: { code: 'ROUTE_NOT_FOUND', message: 'No route for GET /api/v1/nope' },
    })
  })

  it('GET /api/v1/client-config → runtime settings for the web app, signed out', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/client-config' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ sentryDsn: null, environment: 'development', release: null })
  })
})

describe('client config with Sentry', () => {
  it('hands the browser DSN and the deploy commit to the web app', async () => {
    const app = await buildTestApp({
      SENTRY_WEB_DSN: 'https://key@o1.ingest.sentry.io/2',
      SENTRY_ENVIRONMENT: 'staging',
      RAILWAY_GIT_COMMIT_SHA: '0123456789abcdef0123',
    })
    try {
      const res = await app.inject({ method: 'GET', url: '/api/v1/client-config' })
      expect(res.json()).toEqual({ sentryDsn: 'https://key@o1.ingest.sentry.io/2', environment: 'staging', release: '0123456789ab' })
    } finally {
      await app.close()
    }
  })
})
