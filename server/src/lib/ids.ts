import { createHash } from 'node:crypto'

/**
 * Deterministic UUIDv7 for seed data.
 *
 * - The 48-bit timestamp comes from `at`, so seeded rows (e.g. chat messages)
 *   keep "order by id = order by time", exactly like Prisma's uuid(7) default.
 * - The random bits come from a hash of `key`, so re-running the seed produces
 *   the same IDs and upserts are idempotent.
 */
export function seedId(key: string, at: Date | string = SEED_EPOCH): string {
  const ms = BigInt(new Date(at).getTime())
  const hash = createHash('sha256').update(key).digest()
  const bytes = Buffer.alloc(16)

  // unix_ts_ms (48 bits)
  for (let i = 0; i < 6; i++) bytes[i] = Number((ms >> BigInt(8 * (5 - i))) & 0xffn)
  // version 7 + 12 bits rand_a
  bytes[6] = 0x70 | (hash[0] & 0x0f)
  bytes[7] = hash[1]
  // variant 10 + 62 bits rand_b
  bytes[8] = 0x80 | (hash[2] & 0x3f)
  hash.copy(bytes, 9, 3, 10)

  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Timestamp for seed rows that have no natural time of their own. */
export const SEED_EPOCH = '2026-08-30T00:00:00Z'
