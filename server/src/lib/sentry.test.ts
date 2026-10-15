import type { ErrorEvent } from '@sentry/node'
import { describe, expect, it } from 'vitest'
import { scrubEvent, scrubText } from './sentry'

describe('sentry scrubbing', () => {
  it('masks emails, phone numbers and link secrets in text', () => {
    expect(scrubText('Email to malaika@example.com failed')).toBe('Email to [email] failed')
    expect(scrubText('call +92 300 1234567 now')).toBe('call [phone] now')
    expect(scrubText('/reset-password?token=abc123&x=1')).toBe('/reset-password?token=[redacted]&x=1')
    expect(scrubText('Unique constraint failed on (id)')).toBe('Unique constraint failed on (id)')
  })

  it('drops user, headers, cookies, bodies and query strings', () => {
    const event = scrubEvent({
      type: undefined,
      user: { email: 'a@b.co', ip_address: '1.2.3.4' },
      server_name: 'host',
      request: { method: 'POST', url: 'https://x.test/api/v1/auth/invite/SECRET?t=1', headers: { cookie: 'elation_session=1' }, data: '{"password":"p"}', cookies: { a: 'b' } },
      exception: { values: [{ type: 'Error', value: 'no account for a@b.co' }] },
      breadcrumbs: [{ message: 'GET /x?t=zzz', data: { url: 'https://x.test/?t=zzz' } }],
      extra: { body: 'secret' },
    } as ErrorEvent)
    expect(event.user).toBeUndefined()
    expect(event.server_name).toBeUndefined()
    expect(event.request).toEqual({ method: 'POST', url: 'https://x.test/api/v1/auth/invite/[redacted]' })
    expect(event.exception!.values![0].value).toBe('no account for [email]')
    expect(event.breadcrumbs![0]).toEqual({ message: 'GET /x?t=[redacted]', data: undefined })
    expect(event.extra).toBeUndefined()
  })
})
