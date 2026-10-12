import {
  CONSENT_VERSION,
  type AcceptInviteBody,
  type ChangePasswordBody,
  type ConsentBody,
  type InviteLookup,
  type LoginBody,
  type Me,
  type ResetPasswordBody,
  type SessionInfo,
  type UpdateNotificationsBody,
  type UpdateProfileBody,
} from '@elation/shared/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { API_BASE, API_MODE, ApiError, apiFetch } from '@/lib/api/client'
import { currentUser } from '@/mocks/fixtures'

export const meKey = ['me'] as const

// ─────────────── mock mode (no server) ───────────────

let mockMe: Me = {
  id: currentUser.id,
  name: currentUser.name,
  email: currentUser.email,
  phone: currentUser.phone ?? null,
  role: 'client',
  avatarInitials: currentUser.avatarInitials,
  accessExpiresAt: currentUser.accessExpiresAt,
  consultant: { ...currentUser.consultant, avatarInitials: currentUser.consultant.avatarInitials ?? 'AM' },
  city: currentUser.city ?? null,
  clientRole: currentUser.role ?? null,
  partnerName: currentUser.partnerName ?? null,
  emergencyContactName: currentUser.emergencyContactName ?? null,
  emergencyContactPhone: currentUser.emergencyContactPhone ?? null,
  notifications: currentUser.notifications ?? {
    moodboardUpdates: true,
    budgetAlerts: true,
    consultantMessages: true,
    weeklyDigest: false,
    marketing: false,
  },
  consent: null,
}
const later = <T,>(value: T) => new Promise<T>((r) => setTimeout(() => r(value), 250))

// ─────────────── API ───────────────

export const authApi = {
  me: () => (API_MODE === 'mock' ? later(mockMe) : apiFetch<Me>('/me')),
  login: (body: LoginBody) =>
    API_MODE === 'mock' ? later(mockMe) : apiFetch<Me>('/auth/login', { method: 'POST', body }),
  logout: () => (API_MODE === 'mock' ? later(undefined) : apiFetch<void>('/auth/logout', { method: 'POST' })),
  logoutOthers: () =>
    API_MODE === 'mock' ? later(undefined) : apiFetch<void>('/auth/logout-others', { method: 'POST' }),
  lookupInvite: (code: string) =>
    API_MODE === 'mock'
      ? later<InviteLookup>({ email: mockMe.email, name: mockMe.name, consultantName: mockMe.consultant?.name ?? null })
      : apiFetch<InviteLookup>(`/auth/invite/${encodeURIComponent(code)}`),
  acceptInvite: (body: AcceptInviteBody) =>
    API_MODE === 'mock' ? later(mockMe) : apiFetch<Me>('/auth/invite/accept', { method: 'POST', body }),
  forgotPassword: (email: string) =>
    API_MODE === 'mock'
      ? later(undefined)
      : apiFetch<void>('/auth/password/forgot', { method: 'POST', body: { email } }),
  resetPassword: (body: ResetPasswordBody) =>
    API_MODE === 'mock' ? later(undefined) : apiFetch<void>('/auth/password/reset', { method: 'POST', body }),
  changePassword: (body: ChangePasswordBody) =>
    API_MODE === 'mock' ? later(undefined) : apiFetch<void>('/auth/password/change', { method: 'POST', body }),
  updateProfile: (body: UpdateProfileBody) =>
    API_MODE === 'mock'
      ? later((mockMe = { ...mockMe, ...(body as Partial<Me>) }))
      : apiFetch<Me>('/me', { method: 'PATCH', body }),
  updateNotifications: (body: UpdateNotificationsBody) =>
    API_MODE === 'mock'
      ? later((mockMe = { ...mockMe, notifications: { ...mockMe.notifications, ...body } }))
      : apiFetch<Me>('/me/notifications', { method: 'PATCH', body }),
  recordConsent: (body: ConsentBody) =>
    API_MODE === 'mock'
      ? later((mockMe = { ...mockMe, consent: { version: body.version, acceptedAt: new Date().toISOString() } }))
      : apiFetch<Me>('/me/consent', { method: 'POST', body }),
  sessions: () =>
    API_MODE === 'mock'
      ? later<SessionInfo[]>([
          { id: 'mock', userAgent: navigator.userAgent, createdAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), current: true },
        ])
      : apiFetch<SessionInfo[]>('/me/sessions'),
  requestDeletion: (reason?: string) =>
    API_MODE === 'mock'
      ? later(undefined)
      : apiFetch<void>('/me/deletion-request', { method: 'POST', body: { reason } }),
  /** Browser download of everything we hold about the user. */
  exportUrl: `${API_BASE}/me/export`,
}

// ─────────────── hooks ───────────────

/**
 * The signed-in user. `null` = signed out; the query never throws for 401 so
 * ProtectedRoute can redirect instead of showing an error.
 */
export function useMe() {
  return useQuery({
    queryKey: meKey,
    queryFn: async () => {
      try {
        return await authApi.me()
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null
        throw err
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
  })
}

/** Signed-in user for components rendered inside ProtectedRoute (always present there). */
export function useCurrentUser(): Me {
  const { data } = useMe()
  if (!data) throw new Error('useCurrentUser must be used inside ProtectedRoute')
  return data
}

function useSetMe() {
  const qc = useQueryClient()
  return (me: Me) => qc.setQueryData(meKey, me)
}

export function useLogin() {
  const setMe = useSetMe()
  return useMutation({ mutationFn: authApi.login, onSuccess: setMe })
}

export function useAcceptInvite() {
  const setMe = useSetMe()
  return useMutation({ mutationFn: authApi.acceptInvite, onSuccess: setMe })
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: authApi.logout,
    onSettled: () => {
      // Drop every cached query — the next user must not see this user's data.
      qc.clear()
      qc.setQueryData(meKey, null)
    },
  })
}

export function useInviteLookup(code: string | null) {
  return useQuery({
    queryKey: ['invite', code],
    queryFn: () => authApi.lookupInvite(code!),
    enabled: Boolean(code && code.length >= 10),
    retry: false,
  })
}

export const useForgotPassword = () => useMutation({ mutationFn: authApi.forgotPassword })
export const useResetPassword = () => useMutation({ mutationFn: authApi.resetPassword })
export const useChangePassword = () => useMutation({ mutationFn: authApi.changePassword })
export const useLogoutOthers = () => useMutation({ mutationFn: authApi.logoutOthers })
export const useRequestDeletion = () => useMutation({ mutationFn: authApi.requestDeletion })

export function useUpdateProfile() {
  const setMe = useSetMe()
  return useMutation({ mutationFn: authApi.updateProfile, onSuccess: setMe })
}

export function useUpdateNotifications() {
  const setMe = useSetMe()
  return useMutation({ mutationFn: authApi.updateNotifications, onSuccess: setMe })
}

export function useRecordConsent() {
  const setMe = useSetMe()
  return useMutation({
    mutationFn: (choices: Omit<ConsentBody, 'version'>) => authApi.recordConsent({ version: CONSENT_VERSION, ...choices }),
    onSuccess: setMe,
  })
}

export function useSessions() {
  return useQuery({ queryKey: ['me', 'sessions'], queryFn: authApi.sessions })
}

/** Where to land after signing in, by role. */
export function homeFor(me: Pick<Me, 'role'>) {
  return me.role === 'client' ? '/dashboard' : '/admin'
}
