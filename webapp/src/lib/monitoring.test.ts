import { describe, expect, it } from 'vitest'
import { scrubText, scrubUrl } from './monitoring'

describe('browser error scrubbing', () => {
  it('drops query strings and invite codes from URLs', () => {
    expect(scrubUrl('https://x.test/reset-password?token=abc#top')).toBe('https://x.test/reset-password')
    expect(scrubUrl('/api/v1/auth/invite/S3CRET')).toBe('/api/v1/auth/invite/[redacted]')
    expect(scrubUrl('/events/123/budget')).toBe('/events/123/budget')
  })

  it('masks emails and phone numbers in messages', () => {
    expect(scrubText('No account for malaika@example.com (+92 300 1234567)')).toBe('No account for [email] ([phone])')
  })
})
