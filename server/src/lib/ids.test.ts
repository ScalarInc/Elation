import { describe, expect, it } from 'vitest'
import { seedId } from './ids'

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('seedId', () => {
  it('produces a valid UUIDv7', () => {
    expect(seedId('event:e_mehndi')).toMatch(UUID_V7)
  })

  it('is deterministic per key and distinct across keys', () => {
    expect(seedId('a')).toBe(seedId('a'))
    expect(seedId('a')).not.toBe(seedId('b'))
  })

  it('sorts by timestamp, like Prisma uuid(7)', () => {
    const earlier = seedId('msg:z', '2026-09-05T09:00:00Z')
    const later = seedId('msg:a', '2026-09-05T09:12:00Z')
    expect([later, earlier].sort()).toEqual([earlier, later])
  })
})
