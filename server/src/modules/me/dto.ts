import { CLIENT_ROLES, CONSENT_VERSION, notificationPrefsSchema, type Me } from '@elation/shared/api'
import type { Db } from '../../plugins/db'

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? '?').slice(0, 2)
  return letters.toUpperCase()
}

const DEFAULT_PREFS = notificationPrefsSchema.parse({
  moodboardUpdates: true,
  budgetAlerts: true,
  consultantMessages: true,
  weeklyDigest: false,
  marketing: false,
})

/** Load the signed-in user's `Me` view (profile + consultant + current consent). */
export async function loadMe(db: Db, userId: string): Promise<Me> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      consultant: true,
      consents: { where: { version: CONSENT_VERSION }, orderBy: { acceptedAt: 'desc' }, take: 1 },
    },
  })
  const prefs = notificationPrefsSchema.partial().safeParse(user.notificationPrefs)
  const consent = user.consents[0]
  const clientRole = CLIENT_ROLES.find((r) => r === user.clientRole) ?? null

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role.toLowerCase() as Me['role'],
    avatarInitials: initials(user.name),
    accessExpiresAt: user.role === 'CLIENT' ? (user.accessExpiresAt?.toISOString() ?? null) : null,
    consultant: user.consultant
      ? {
          id: user.consultant.id,
          name: user.consultant.name,
          email: user.consultant.email,
          avatarInitials: initials(user.consultant.name),
        }
      : null,
    city: user.city,
    clientRole,
    partnerName: user.partnerName,
    emergencyContactName: user.emergencyContactName,
    emergencyContactPhone: user.emergencyContactPhone,
    notifications: { ...DEFAULT_PREFS, ...(prefs.success ? prefs.data : {}) },
    consent: consent ? { version: consent.version, acceptedAt: consent.acceptedAt.toISOString() } : null,
  }
}
