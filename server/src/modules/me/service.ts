import {
  CONSENT_VERSION,
  type ConsentBody,
  type SessionInfo,
  type UpdateNotificationsBody,
} from '@elation/shared/api'
import type { Prisma } from '../../generated/prisma/client'
import { AppError } from '../../lib/errors'
import type { Db } from '../../plugins/db'

export async function updateProfile(
  db: Db,
  userId: string,
  input: {
    name?: string
    phone?: string | null
    city?: string | null
    clientRole?: string | null
    partnerName?: string | null
    emergencyContactName?: string | null
    emergencyContactPhone?: string | null
  },
) {
  await db.user.update({ where: { id: userId }, data: input })
}

export async function updateNotifications(db: Db, userId: string, patch: UpdateNotificationsBody) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { notificationPrefs: true } })
  const current = (user.notificationPrefs ?? {}) as Record<string, boolean>
  await db.user.update({ where: { id: userId }, data: { notificationPrefs: { ...current, ...patch } } })
}

export async function recordConsent(db: Db, userId: string, input: ConsentBody, ip?: string) {
  if (input.version !== CONSENT_VERSION) {
    throw new AppError('CONSENT_VERSION_MISMATCH', 409, 'The terms have changed — please review them again', {
      currentVersion: CONSENT_VERSION,
    })
  }
  await db.consent.create({ data: { userId, ...input, ip } })
}

export async function listSessions(db: Db, userId: string, currentSessionId: string): Promise<SessionInfo[]> {
  const sessions = await db.session.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: 'desc' },
  })
  return sessions.map((s) => ({
    id: s.id.slice(0, 8),
    userAgent: s.userAgent,
    createdAt: s.createdAt.toISOString(),
    lastSeenAt: s.lastSeenAt.toISOString(),
    current: s.id === currentSessionId,
  }))
}

/**
 * Everything we hold about a client, as one JSON document (Settings → "Export my data").
 * Secrets (password hash, session ids, invite codes) are never included.
 */
export async function exportData(db: Db, userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    omit: { passwordHash: true },
    include: { consents: true },
  })
  const events = await db.event.findMany({
    where: { clientId: userId },
    include: {
      questionnaire: true,
      moodboards: { include: { tiles: true } },
      budgetPlan: { include: { lines: true, quotes: true } },
      files: { where: { deletedAt: null }, omit: { key: true, bucket: true } },
      activity: true,
    },
  })
  const threads = await db.thread.findMany({
    where: { clientId: userId },
    include: { messages: { where: { deletedAt: null }, orderBy: { id: 'asc' } } },
  })
  return { exportedAt: new Date().toISOString(), profile: user, events, conversations: threads }
}

/**
 * Deletion is confirmed by an admin (open question 2 in docs/00-decisions.md):
 * record the request in the audit log so it shows up in admin; nothing is deleted yet.
 */
export async function requestDeletion(db: Db, userId: string, reason: string | undefined, ip?: string) {
  const existing = await db.auditLog.findFirst({
    where: { targetType: 'User', targetId: userId, action: 'user.deletion-requested' },
  })
  if (existing) return
  await db.auditLog.create({
    data: {
      actorId: userId,
      action: 'user.deletion-requested',
      targetType: 'User',
      targetId: userId,
      after: { reason: reason ?? null } as Prisma.InputJsonValue,
      ip,
    },
  })
}
