import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp } from '../test/app'

describe('webapp serving (one-service deploy)', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>
  let dist: string

  beforeAll(async () => {
    dist = mkdtempSync(path.join(tmpdir(), 'elation-dist-'))
    mkdirSync(path.join(dist, 'assets'))
    writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>Elation X</title>')
    writeFileSync(path.join(dist, 'assets', 'app-abc123.js'), 'console.log(1)')
    app = await buildTestApp({ SERVE_WEBAPP_DIST: dist })
  })
  afterAll(async () => {
    await app.close()
    rmSync(dist, { recursive: true, force: true })
  })

  it('serves index.html at /', async () => {
    const res = await app.inject({ method: 'GET', url: '/' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('Elation X')
  })

  it('serves hashed assets with long-lived cache headers', async () => {
    const res = await app.inject({ method: 'GET', url: '/assets/app-abc123.js' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toContain('immutable')
  })

  it('falls back to index.html for client-side routes', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/events/123',
      headers: { accept: 'text/html' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('Elation X')
    expect(res.headers['cache-control']).toBe('no-cache')
  })

  it('keeps JSON 404s for unknown API routes', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/missing',
      headers: { accept: 'text/html' },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('ROUTE_NOT_FOUND')
  })
})
