import { z } from 'zod'

/**
 * Request/response contracts for auth + the signed-in user (docs/step-03-auth.md).
 * The server validates with these schemas; the webapp uses the inferred types.
 */

export const PASSWORD_MIN_LENGTH = 10
export const password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(200, 'Password is too long')

export const email = z.string().trim().toLowerCase().email('Enter a valid email')

export const CLIENT_ROLES = ['Bride', 'Groom', 'Family', 'Organizer'] as const
export type ClientRole = (typeof CLIENT_ROLES)[number]

export const notificationPrefsSchema = z.object({
  moodboardUpdates: z.boolean(),
  budgetAlerts: z.boolean(),
  consultantMessages: z.boolean(),
  weeklyDigest: z.boolean(),
  marketing: z.boolean(),
})
export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>

export const meSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  role: z.enum(['client', 'consultant', 'admin']),
  avatarInitials: z.string(),
  /** ISO timestamp; null for staff accounts (no expiry). */
  accessExpiresAt: z.string().nullable(),
  consultant: z
    .object({ id: z.string(), name: z.string(), email: z.string(), avatarInitials: z.string() })
    .nullable(),
  city: z.string().nullable(),
  clientRole: z.enum(CLIENT_ROLES).nullable(),
  partnerName: z.string().nullable(),
  emergencyContactName: z.string().nullable(),
  emergencyContactPhone: z.string().nullable(),
  notifications: notificationPrefsSchema,
  consent: z.object({ version: z.number().int(), acceptedAt: z.string() }).nullable(),
})
export type Me = z.infer<typeof meSchema>

// ─── Requests ───

export const loginBody = z.object({
  email,
  password: z.string().min(1, 'Enter your password').max(200),
  remember: z.boolean().default(true),
})
export type LoginBody = z.input<typeof loginBody>

export const inviteLookupResponse = z.object({
  email: z.string(),
  name: z.string(),
  consultantName: z.string().nullable(),
})
export type InviteLookup = z.infer<typeof inviteLookupResponse>

export const acceptInviteBody = z.object({
  code: z.string().trim().min(10, 'Enter your invitation code').max(100),
  password,
  name: z.string().trim().min(2).max(120).optional(),
})
export type AcceptInviteBody = z.input<typeof acceptInviteBody>

export const forgotPasswordBody = z.object({ email })
export const resetPasswordBody = z.object({ token: z.string().min(10).max(200), password })
export type ResetPasswordBody = z.input<typeof resetPasswordBody>

export const changePasswordBody = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: password,
})
export type ChangePasswordBody = z.input<typeof changePasswordBody>

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional()

export const updateProfileBody = z.object({
  name: z.string().trim().min(2, 'Name is required').max(120).optional(),
  phone: optionalText(40),
  city: optionalText(80),
  clientRole: z.enum(CLIENT_ROLES).nullable().optional(),
  partnerName: optionalText(120),
  emergencyContactName: optionalText(120),
  emergencyContactPhone: optionalText(40),
})
export type UpdateProfileBody = z.input<typeof updateProfileBody>

export const updateNotificationsBody = notificationPrefsSchema.partial()
export type UpdateNotificationsBody = z.infer<typeof updateNotificationsBody>

/** Bump when the consent text changes; clients are asked again. */
export const CONSENT_VERSION = 1

export const consentBody = z.object({
  version: z.number().int().positive(),
  terms: z.literal(true),
  dataUse: z.literal(true),
  studioShare: z.literal(true),
  marketing: z.boolean(),
})
export type ConsentBody = z.infer<typeof consentBody>

export const sessionSchema = z.object({
  id: z.string(), // short, non-secret prefix of the session id
  userAgent: z.string().nullable(),
  createdAt: z.string(),
  lastSeenAt: z.string(),
  current: z.boolean(),
})
export type SessionInfo = z.infer<typeof sessionSchema>

export const inviteClientBody = z.object({
  name: z.string().trim().min(2).max(120),
  email,
  phone: z.string().trim().max(40).optional(),
  consultantId: z.string().uuid().optional(),
  accessDays: z.number().int().min(1).max(730).optional(),
})
export type InviteClientBody = z.input<typeof inviteClientBody>

export const inviteClientResponse = z.object({
  userId: z.string(),
  activationUrl: z.string(),
  inviteExpiresAt: z.string(),
})

/** Error codes the auth flows can return; the UI switches on these. */
export const AUTH_ERROR_CODES = [
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'ACCESS_EXPIRED',
  'ACCESS_REVOKED',
  'INVITE_INVALID',
  'RESET_TOKEN_INVALID',
  'PASSWORD_TOO_COMMON',
  'FORBIDDEN',
  'BAD_ORIGIN',
] as const
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number]
