import { useAuthStore } from '@/stores/authStore'
import type { ClientUser } from '@/types'

/** The signed-in user, or null while loading / signed out. */
export function useCurrentUser(): ClientUser | null {
  return useAuthStore((s) => s.user)
}
