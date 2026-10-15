import { describe, expect, it } from 'vitest'
import { loadConfig } from '../config'
import { buildTestApp } from '../test/app'
import { cspDirectives, storageOrigins } from './csp'

const base = { DATABASE_URL: 'postgresql://x@localhost/x', APP_URL: 'https://elation-prod.up.railway.app' }

describe('content security policy', () => {
  it('allows the R2 bucket hosts of the configured account, and the public CDN', () => {
    const c = loadConfig({ ...base, R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's', R2_ACCOUNT_ID: 'abc123', R2_PUBLIC_BASE_URL: 'https://pub-xyz.r2.dev/' })
    expect(storageOrigins(c)).toEqual(['https://*.abc123.r2.cloudflarestorage.com', 'https://abc123.r2.cloudflarestorage.com', 'https://pub-xyz.r2.dev'])
  })

  it('uses a custom S3 endpoint as-is (MinIO)', () => {
    const c = loadConfig({ ...base, R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's', R2_ENDPOINT: 'http://localhost:9000' })
    expect(storageOrigins(c)).toEqual(['http://localhost:9000'])
  })

  it('scripts only from our origin; uploads, websocket and Sentry in connect-src', () => {
    const c = loadConfig({
      ...base,
      NODE_ENV: 'production',
      R2_ACCESS_KEY_ID: 'k',
      R2_SECRET_ACCESS_KEY: 's',
      R2_ACCOUNT_ID: 'abc123',
      R2_PUBLIC_BASE_URL: 'https://pub-xyz.r2.dev',
      SENTRY_WEB_DSN: 'https://key@o1.ingest.de.sentry.io/42',
    })
    const d = cspDirectives(c)
    expect(d['script-src']).toEqual(["'self'"])
    expect(d['frame-ancestors']).toEqual(["'none'"])
    expect(d['connect-src']).toEqual([
      "'self'",
      'wss://elation-prod.up.railway.app',
      'https://*.abc123.r2.cloudflarestorage.com',
      'https://abc123.r2.cloudflarestorage.com',
      'https://pub-xyz.r2.dev',
      'https://o1.ingest.de.sentry.io',
    ])
    expect(d).toHaveProperty('upgrade-insecure-requests')
  })

  it('is sent on every response, with the other security headers', async () => {
    const app = await buildTestApp()
    try {
      const res = await app.inject({ method: 'GET', url: '/api/v1/healthz' })
      const csp = String(res.headers['content-security-policy'])
      expect(csp).toContain("default-src 'self'")
      expect(csp).toContain("script-src 'self'")
      expect(csp).toContain("object-src 'none'")
      expect(csp).not.toContain('upgrade-insecure-requests') // tests run over http
      expect(res.headers['x-content-type-options']).toBe('nosniff')
      expect(res.headers['strict-transport-security']).toContain('max-age=')
      expect(res.headers['referrer-policy']).toBe('no-referrer')
    } finally {
      await app.close()
    }
  })
})
