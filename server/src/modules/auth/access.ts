import type { User } from '../../generated/prisma/client'

export type AccessProblem = 'ACCESS_EXPIRED' | 'ACCESS_REVOKED' | null

/**
 * Whether an account may use the platform right now (docs/step-03-auth.md).
 * Staff never expire; clients stop at `accessExpiresAt` or when marked EXPIRED.
 */
export function accessProblem(
  user: Pick<User, 'role' | 'status' | 'accessExpiresAt'>,
  now: Date = new Date(),
): AccessProblem {
  if (user.status === 'REVOKED') return 'ACCESS_REVOKED'
  if (user.role !== 'CLIENT') return null
  if (user.status === 'EXPIRED') return 'ACCESS_EXPIRED'
  if (user.accessExpiresAt && user.accessExpiresAt.getTime() <= now.getTime()) return 'ACCESS_EXPIRED'
  return null
}

export const ACCESS_MESSAGES: Record<Exclude<AccessProblem, null>, string> = {
  ACCESS_EXPIRED: 'Your Elation X access has ended. Contact your consultant to extend it.',
  ACCESS_REVOKED: 'This account has been closed. Contact Elation if you think this is a mistake.',
}
