import type { Config } from '../../config'
import type { User } from '../../generated/prisma/client'
import { randomToken, sha256 } from '../../lib/crypto'
import { inviteEmail } from '../../lib/emails'
import { AppError } from '../../lib/errors'
import type { Mailer } from '../../lib/mailer'
import type { Db } from '../../plugins/db'

const INVITE_VALID_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Admin/consultant invites a client (docs/step-03-auth.md; the full admin
 * client-management API arrives in Step 12). Creates the INVITED user + a
 * one-time code, emails the activation link and returns it for WhatsApp sharing.
 */
export async function inviteClient(
  deps: { db: Db; config: Config; mailer: Mailer },
  actor: Pick<User, 'id' | 'role'>,
  input: { name: string; email: string; phone?: string; consultantId?: string; accessDays?: number },
  meta: { ip?: string },
) {
  const { db, config, mailer } = deps

  // Consultants invite their own clients; admins choose (default: themselves).
  const consultantId = actor.role === 'CONSULTANT' ? actor.id : (input.consultantId ?? actor.id)
  const consultant = await db.user.findFirst({
    where: { id: consultantId, role: { in: ['CONSULTANT', 'ADMIN'] }, status: 'ACTIVE' },
  })
  if (!consultant) throw new AppError('CONSULTANT_NOT_FOUND', 422, 'Choose an active consultant')

  const existing = await db.user.findUnique({ where: { email: input.email } })
  if (existing && existing.status !== 'INVITED') {
    throw new AppError('ALREADY_EXISTS', 409, 'An account with this email already exists')
  }

  const code = randomToken(16)
  const now = new Date()
  const inviteExpiresAt = new Date(now.getTime() + INVITE_VALID_DAYS * DAY_MS)
  const accessDays = input.accessDays ?? config.DEFAULT_CLIENT_ACCESS_DAYS

  const user = await db.$transaction(async (tx) => {
    const user = existing
      ? await tx.user.update({
          where: { id: existing.id },
          data: { name: input.name, phone: input.phone, consultantId },
        })
      : await tx.user.create({
          data: {
            email: input.email,
            name: input.name,
            phone: input.phone,
            role: 'CLIENT',
            status: 'INVITED',
            consultantId,
          },
        })
    // Re-inviting replaces any earlier open invite.
    await tx.invite.updateMany({
      where: { userId: user.id, acceptedAt: null, revokedAt: null },
      data: { revokedAt: now },
    })
    await tx.invite.create({
      data: {
        email: input.email,
        userId: user.id,
        codeHash: sha256(code),
        accessDays,
        createdById: actor.id,
        expiresAt: inviteExpiresAt,
      },
    })
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: existing ? 'user.reinvite' : 'user.invite',
        targetType: 'User',
        targetId: user.id,
        after: { email: input.email, consultantId, accessDays },
        ip: meta.ip,
      },
    })
    return user
  })

  const activationUrl = `${config.APP_URL}/auth?mode=activate&code=${encodeURIComponent(code)}`
  await mailer.send(
    inviteEmail({
      to: user.email,
      name: user.name,
      consultantName: consultant.name,
      activationUrl,
      code,
      expiresAt: inviteExpiresAt,
    }),
  )

  return { userId: user.id, activationUrl, inviteExpiresAt: inviteExpiresAt.toISOString() }
}
