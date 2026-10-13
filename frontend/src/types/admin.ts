import type { UUID } from '@/types'

/** Types for the admin console API (/api/admin/*). */

export type AdminSummary = { id: UUID; name: string; email: string; avatarInitials: string }

export type ClientStatus = 'pending' | 'active' | 'expired' | 'revoked'

export type AdminClient = {
  id: UUID
  name: string
  email: string
  avatarInitials: string
  phone: string | null
  city: string | null
  /** Derived: revoked > expired > pending (invite not accepted) > active. */
  status: ClientStatus
  accessStatus: 'active' | 'revoked'
  accessExpiresAt: string
  invitationStatus: 'pending' | 'accepted'
  invitedAt: string | null
  activatedAt: string | null
  createdAt: string
  consultant: AdminSummary | null
  eventCount: number
}

export type ClientCreateInput = {
  name: string
  email: string
  phone?: string
  city?: string
  /** Defaults to CLIENT_ACCESS_DEFAULT_DAYS (30) on the server. */
  accessDays?: number
}

export type ClientUpdateInput = Partial<{
  name: string
  phone: string | null
  city: string | null
  accessExpiresAt: string
  accessStatus: 'active' | 'revoked'
  consultantId: UUID | null
}>

/** Returned when creating a client or re-sending an invite. */
export type InviteResult = {
  client: AdminClient
  /** One-time set-password link; admins can copy it if the email didn't arrive. */
  inviteLink: string
  emailSent: boolean
  emailError: string | null
}
