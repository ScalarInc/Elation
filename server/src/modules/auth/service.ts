import type { Config } from '../../config'
import { randomToken, sha256 } from '../../lib/crypto'
import { passwordResetEmail } from '../../lib/emails'
import { AppError } from '../../lib/errors'
import type { Mailer } from '../../lib/mailer'
import {
  assertPasswordAllowed,
  burnPasswordCheck,
  hashPassword,
  verifyPassword,
} from '../../lib/password'
import type { Db } from '../../plugins/db'
import { ACCESS_MESSAGES, accessProblem } from './access'
import { createSession, deleteUserSessions } from './sessions'

type Deps = { db: Db; config: Config; mailer: Mailer }
type ClientMeta = { userAgent?: string; ip?: string }

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

const invalidCredentials = () =>
  new AppError('INVALID_CREDENTIALS', 401, 'That email and password don’t match')

export async function login(
  { db, config }: Deps,
  input: { email: string; password: string; remember: boolean },
  meta: ClientMeta,
) {
  const user = await db.user.findUnique({ where: { email: input.email } })
  if (!user?.passwordHash) {
    await burnPasswordCheck(input.password)
    throw invalidCredentials()
  }
  if (!(await verifyPassword(user.passwordHash, input.password))) throw invalidCredentials()

  // Only reveal access state once the password is proven.
  const problem = accessProblem(user)
  if (problem) {
    if (problem === 'ACCESS_EXPIRED' && user.status === 'ACTIVE') {
      await db.user.update({ where: { id: user.id }, data: { status: 'EXPIRED' } })
    }
    throw new AppError(problem, 403, ACCESS_MESSAGES[problem])
  }

  const token = await createSession(db, config, { userId: user.id, persistent: input.remember, ...meta })
  await db.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } })
  return { userId: user.id, token }
}

export async function logout({ db }: Pick<Deps, 'db'>, sessionId: string) {
  await db.session.deleteMany({ where: { id: sessionId } })
}

// ─────────────── Invitations ───────────────

async function findOpenInvite(db: Db, code: string) {
  const invite = await db.invite.findUnique({ where: { codeHash: sha256(code.trim()) } })
  if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt <= new Date()) {
    throw new AppError('INVITE_INVALID', 404, 'This invitation is invalid or has expired. Ask your consultant for a new one.')
  }
  return invite
}

export async function lookupInvite({ db }: Pick<Deps, 'db'>, code: string) {
  const invite = await findOpenInvite(db, code)
  const user = await db.user.findUniqueOrThrow({ where: { id: invite.userId }, include: { consultant: true } })
  return { email: user.email, name: user.name, consultantName: user.consultant?.name ?? null }
}

export async function acceptInvite(
  { db, config }: Deps,
  input: { code: string; password: string; name?: string },
  meta: ClientMeta,
) {
  const invite = await findOpenInvite(db, input.code)
  assertPasswordAllowed(input.password)
  const passwordHash = await hashPassword(input.password)
  const now = new Date()

  await db.$transaction([
    db.user.update({
      where: { id: invite.userId },
      data: {
        passwordHash,
        status: 'ACTIVE',
        ...(input.name ? { name: input.name } : {}),
        accessExpiresAt: new Date(now.getTime() + invite.accessDays * DAY_MS),
      },
    }),
    db.invite.update({ where: { id: invite.id }, data: { acceptedAt: now } }),
    // Any other open invites for this person are now pointless.
    db.invite.updateMany({
      where: { userId: invite.userId, id: { not: invite.id }, acceptedAt: null, revokedAt: null },
      data: { revokedAt: now },
    }),
  ])

  const token = await createSession(db, config, { userId: invite.userId, persistent: true, ...meta })
  return { userId: invite.userId, token }
}

// ─────────────── Passwords ───────────────

/** Always succeeds from the caller's point of view — never reveals whether the email exists. */
export async function requestPasswordReset({ db, config, mailer }: Deps, email: string) {
  const user = await db.user.findUnique({ where: { email } })
  if (!user?.passwordHash || accessProblem(user) === 'ACCESS_REVOKED') return

  const token = randomToken()
  await db.passwordResetToken.create({
    data: { id: sha256(token), userId: user.id, expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
  })
  const resetUrl = `${config.APP_URL}/reset-password?token=${encodeURIComponent(token)}`
  await mailer.send(passwordResetEmail({ to: user.email, name: user.name, resetUrl }))
}

export async function resetPassword({ db }: Pick<Deps, 'db'>, input: { token: string; password: string }) {
  const record = await db.passwordResetToken.findUnique({ where: { id: sha256(input.token) } })
  if (!record || record.usedAt || record.expiresAt <= new Date()) {
    throw new AppError('RESET_TOKEN_INVALID', 400, 'This reset link is invalid or has expired. Request a new one.')
  }
  assertPasswordAllowed(input.password)
  const passwordHash = await hashPassword(input.password)
  const now = new Date()
  await db.$transaction([
    db.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    db.passwordResetToken.updateMany({ where: { userId: record.userId, usedAt: null }, data: { usedAt: now } }),
    db.session.deleteMany({ where: { userId: record.userId } }),
  ])
}

export async function changePassword(
  { db }: Pick<Deps, 'db'>,
  input: { userId: string; sessionId: string; currentPassword: string; newPassword: string },
) {
  const user = await db.user.findUniqueOrThrow({ where: { id: input.userId } })
  if (!user.passwordHash || !(await verifyPassword(user.passwordHash, input.currentPassword))) {
    // 400, not 401: the session is fine, only the typed password is wrong.
    throw new AppError('CURRENT_PASSWORD_INCORRECT', 400, 'Your current password is incorrect')
  }
  assertPasswordAllowed(input.newPassword)
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(input.newPassword) } })
  await deleteUserSessions(db, user.id, input.sessionId)
}
