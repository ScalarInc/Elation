import type { Config } from '../../config'
import type { Role, User } from '../../generated/prisma/client'
import { randomToken, sha256 } from '../../lib/crypto'
import { inviteEmail } from '../../lib/emails'
import { AppError } from '../../lib/errors'
import type { Mailer } from '../../lib/mailer'
import type { Db } from '../../plugins/db'
import { audit } from './audit'
import { getSettings } from './settings'

const INVITE_VALID_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

type Deps = { db: Db; config: Config; mailer: Mailer; log?: { warn: (o: object, m: string) => void } }

/**
 * Invite someone (docs/step-03-auth.md, step-12-admin.md): creates the INVITED
 * user + a one-time code, emails the activation link and returns it for
 * WhatsApp sharing. Clients get a consultant and an access window; staff don't.
 */
async function invite(
  deps: Deps,
  actor: Pick<User, 'id' | 'role'>,
  input: { name: string; email: string; phone?: string; role: Role; consultantId?: string | null; accessDays?: number },
  meta: { ip?: string },
) {
  const { db, config, mailer } = deps
  const settings = await getSettings(db, config)

  let consultant: { id: string; name: string } | null = null
  if (input.role === 'CLIENT') {
    // Consultants invite their own clients; admins choose (default: themselves).
    const consultantId = actor.role === 'CONSULTANT' ? actor.id : (input.consultantId ?? actor.id)
    consultant = await db.user.findFirst({ where: { id: consultantId, role: { in: ['CONSULTANT', 'ADMIN'] }, status: 'ACTIVE' } })
    if (!consultant) throw new AppError('CONSULTANT_NOT_FOUND', 422, 'Choose an active consultant')
  }

  const existing = await db.user.findUnique({ where: { email: input.email } })
  if (existing && (existing.status !== 'INVITED' || existing.role !== input.role)) {
    throw new AppError('ALREADY_EXISTS', 409, 'An account with this email already exists')
  }
  // A consultant can't take over someone else's pending invite (and get its link).
  if (existing && actor.role === 'CONSULTANT' && existing.consultantId !== actor.id) {
    throw new AppError('ALREADY_EXISTS', 409, 'This person was already invited by another consultant')
  }

  const code = randomToken(16)
  const now = new Date()
  const inviteExpiresAt = new Date(now.getTime() + INVITE_VALID_DAYS * DAY_MS)
  const accessDays = input.role === 'CLIENT' ? (input.accessDays ?? settings.defaultAccessDays) : 0

  const user = await db.$transaction(async (tx) => {
    const data = { name: input.name, phone: input.phone, consultantId: consultant?.id ?? null }
    const user = existing
      ? await tx.user.update({ where: { id: existing.id }, data })
      : await tx.user.create({ data: { ...data, email: input.email, role: input.role, status: 'INVITED' } })
    // Re-inviting replaces any earlier open invite.
    await tx.invite.updateMany({ where: { userId: user.id, acceptedAt: null, revokedAt: null }, data: { revokedAt: now } })
    await tx.invite.create({
      data: { email: input.email, userId: user.id, codeHash: sha256(code), accessDays, createdById: actor.id, expiresAt: inviteExpiresAt },
    })
    await audit(tx, actor, existing ? 'user.reinvite' : 'user.invite', 'User', user.id, {
      after: { email: input.email, role: input.role, consultantId: consultant?.id ?? null, accessDays },
      ip: meta.ip,
    })
    return user
  })

  const activationUrl = `${config.APP_URL}/auth?mode=activate&code=${encodeURIComponent(code)}`
  const emailed = await mailer
    .send(
    inviteEmail({
      to: user.email,
      name: user.name,
      consultantName: consultant?.name ?? null,
      activationUrl,
      code,
      expiresAt: inviteExpiresAt,
      intro: input.role === 'CLIENT' ? settings.inviteIntro : undefined,
      staff: input.role !== 'CLIENT',
    }),
  )
    .then(() => true)
    // The invite is saved; a mail outage mustn't lose the link — the caller can share it.
    .catch((err: unknown) => {
      deps.log?.warn({ err, userId: user.id }, 'invite email failed')
      return false
    })

  return { userId: user.id, activationUrl, inviteExpiresAt: inviteExpiresAt.toISOString(), emailed }
}

export function inviteClient(
  deps: Deps,
  actor: Pick<User, 'id' | 'role'>,
  input: { name: string; email: string; phone?: string; consultantId?: string; accessDays?: number },
  meta: { ip?: string },
) {
  return invite(deps, actor, { ...input, role: 'CLIENT' }, meta)
}

/** Admin only: a consultant or another admin. */
export function inviteStaff(deps: Deps, actor: Pick<User, 'id' | 'role'>, input: { name: string; email: string; role: 'consultant' | 'admin' }, meta: { ip?: string }) {
  return invite(deps, actor, { name: input.name, email: input.email, role: input.role === 'admin' ? 'ADMIN' : 'CONSULTANT' }, meta)
}

/** A fresh link for someone who hasn't activated yet; the old one stops working. */
export async function resendInvite(deps: Deps, actor: Pick<User, 'id' | 'role'>, userId: string, meta: { ip?: string }) {
  const user = await deps.db.user.findUnique({ where: { id: userId } })
  if (!user || user.status !== 'INVITED') throw new AppError('NOT_INVITED', 422, 'Only people who haven’t activated yet can get a new invite')
  const last = await deps.db.invite.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } })
  return invite(
    deps,
    actor,
    { name: user.name, email: user.email, phone: user.phone ?? undefined, role: user.role, consultantId: user.consultantId, accessDays: last?.accessDays || undefined },
    meta,
  )
}
