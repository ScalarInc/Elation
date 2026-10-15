import { Writable } from 'node:stream'
import pino from 'pino'
import { describe, expect, it } from 'vitest'
import { REDACT_PATHS, redactUrl } from './logging'

describe('log redaction', () => {
  it('hides signed-link tokens and invite codes in request URLs', () => {
    expect(redactUrl('/api/v1/storage/local?t=abc.def&x=1')).toBe('/api/v1/storage/local?t=[redacted]&x=1')
    expect(redactUrl('/api/v1/auth/invite/S3cr3tC0de')).toBe('/api/v1/auth/invite/[redacted]')
    expect(redactUrl('/api/v1/auth/invite/accept')).toBe('/api/v1/auth/invite/accept')
    expect(redactUrl('/api/v1/events/123')).toBe('/api/v1/events/123')
  })

  it('replaces contact details and secrets in log objects', () => {
    const lines: string[] = []
    const sink = new Writable({ write: (chunk, _enc, done) => (lines.push(String(chunk)), done()) })
    const log = pino({ redact: { paths: REDACT_PATHS, censor: '[redacted]' } }, sink)
    log.info({ email: 'a@b.c', user: { phone: '+92 300', password: 'p', id: 'u1' }, to: 'x@y.z', err: { code: 'P2002' } }, 'hi')
    const line = JSON.parse(lines[0])
    expect(line.email).toBe('[redacted]')
    expect(line.to).toBe('[redacted]')
    expect(line.user).toEqual({ phone: '[redacted]', password: '[redacted]', id: 'u1' })
    expect(line.err.code).toBe('P2002')
  })
})
