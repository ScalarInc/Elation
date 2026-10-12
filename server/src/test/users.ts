import type { Role } from '../generated/prisma/client'
import { hashPassword } from '../lib/password'
import type { Db } from '../plugins/db'

export const TEST_PASSWORD = 'correct horse battery'

let counter = 0

/** Create an ACTIVE user with a known password. Clients get 90 days of access. */
export async function createUser(
  db: Db,
  opts: { role?: Role; email?: string; name?: string; consultantId?: string; accessExpiresAt?: Date | null } = {},
) {
  counter += 1
  const role = opts.role ?? 'CLIENT'
  return db.user.create({
    data: {
      email: opts.email ?? `${role.toLowerCase()}${counter}@test.local`,
      name: opts.name ?? `${role[0]}${role.slice(1).toLowerCase()} ${counter}`,
      role,
      status: 'ACTIVE',
      passwordHash: await hashPassword(TEST_PASSWORD),
      consultantId: opts.consultantId,
      accessExpiresAt:
        opts.accessExpiresAt !== undefined
          ? opts.accessExpiresAt
          : role === 'CLIENT'
            ? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
            : null,
    },
  })
}
