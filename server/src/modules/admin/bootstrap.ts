import { randomToken, sha256 } from '../../lib/crypto'
import { AppError } from '../../lib/errors'
import type { Db } from '../../plugins/db'

const INVITE_VALID_DAYS = 2
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The first admin of a fresh production database (docs/step-14-deploy-ops.md).
 * Accounts are invite-only and every invite needs an inviter, so the first one
 * comes from the command line: an INVITED admin plus a one-time activation link,
 * printed for the operator — never emailed, never logged by the server.
 * Refuses when an active admin already exists (then invite from the console).
 */
export async function bootstrapAdmin(
  db: Db,
  input: { email: string; name: string; appUrl: string },
  now = new Date(),
): Promise<{ userId: string; activationUrl: string; expiresAt: Date }> {
  const email = input.email.trim().toLowerCase()
  const name = input.name.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError('BAD_EMAIL', 422, `Not an email address: ${input.email}`)
  if (name.length < 2) throw new AppError('BAD_NAME', 422, 'Give the admin’s name')

  if (await db.user.count({ where: { role: 'ADMIN', status: 'ACTIVE' } })) {
    throw new AppError('ADMIN_EXISTS', 409, 'An active admin already exists — invite more people from Admin → Team')
  }
  const existing = await db.user.findUnique({ where: { email } })
  if (existing && (existing.role !== 'ADMIN' || existing.status !== 'INVITED')) {
    throw new AppError('ALREADY_EXISTS', 409, 'An account with this email already exists')
  }

  const code = randomToken(16)
  const expiresAt = new Date(now.getTime() + INVITE_VALID_DAYS * DAY_MS)
  const user = await db.$transaction(async (tx) => {
    const user = existing ?? (await tx.user.create({ data: { email, name, role: 'ADMIN', status: 'INVITED' } }))
    await tx.invite.updateMany({ where: { userId: user.id, acceptedAt: null, revokedAt: null }, data: { revokedAt: now } })
    // No inviter exists yet: the invite is "from" the new admin.
    await tx.invite.create({ data: { email, userId: user.id, codeHash: sha256(code), accessDays: 0, createdById: user.id, expiresAt } })
    await tx.auditLog.create({ data: { action: 'user.bootstrap-admin', targetType: 'User', targetId: user.id, after: { role: 'ADMIN' } } })
    return user
  })
  const activationUrl = `${input.appUrl.replace(/\/$/, '')}/auth?mode=activate&code=${encodeURIComponent(code)}`
  return { userId: user.id, activationUrl, expiresAt }
}
