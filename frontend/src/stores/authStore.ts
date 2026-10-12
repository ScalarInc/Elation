import { create } from 'zustand'
import { ApiRequestError } from '@/api/client'
import { api } from '@/api'
import { supabase } from '@/lib/supabase'
import type { ClientUser } from '@/types'

/**
 * Session state for the whole app.
 *  - loading:   checking the stored session on startup
 *  - signedOut: no session
 *  - signedIn:  session + profile loaded (`user` is set)
 *  - blocked:   valid session but the backend refused access (expired, revoked, no profile)
 */
type AuthStatus = 'loading' | 'signedOut' | 'signedIn' | 'blocked'

type AuthState = {
  status: AuthStatus
  user: ClientUser | null
  /** Backend error code when `status === 'blocked'`, e.g. ACCESS_EXPIRED. */
  blockedCode: string | null
  /** Set when loading the profile failed for another reason (e.g. backend offline). */
  loadError: string | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  /** Re-fetch /api/me (after profile edits or a password set). */
  refreshUser: () => Promise<void>
  setUser: (user: ClientUser) => void
}

const BLOCKED_CODES = new Set(['ACCESS_EXPIRED', 'ACCESS_REVOKED', 'NO_PROFILE'])

export const useAuthStore = create<AuthState>()((set, get) => ({
  status: 'loading',
  user: null,
  blockedCode: null,
  loadError: null,

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      throw new Error(
        error.message === 'Invalid login credentials' ? 'Email or password is incorrect.' : error.message,
      )
    }
    await get().refreshUser()
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ status: 'signedOut', user: null, blockedCode: null, loadError: null })
  },

  refreshUser: async () => {
    try {
      const user = await api.me.get()
      set({ status: 'signedIn', user, blockedCode: null, loadError: null })
    } catch (err) {
      if (err instanceof ApiRequestError && BLOCKED_CODES.has(err.code)) {
        set({ status: 'blocked', user: null, blockedCode: err.code, loadError: null })
      } else if (err instanceof ApiRequestError && err.status === 401) {
        await supabase.auth.signOut()
        set({ status: 'signedOut', user: null, blockedCode: null, loadError: null })
      } else {
        set({ status: 'signedOut', user: null, loadError: (err as Error).message })
      }
    }
  },

  setUser: (user) => set({ user }),
}))

/** Call once at startup: restores the stored session and follows sign-in/out events. */
export function initAuth() {
  supabase.auth.onAuthStateChange((event, session) => {
    // Defer so Supabase finishes its own work before we call the API (avoids a known deadlock).
    setTimeout(() => {
      const { status, refreshUser } = useAuthStore.getState()
      if (!session) {
        useAuthStore.setState({ status: 'signedOut', user: null, blockedCode: null })
      } else if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || status === 'loading') {
        void refreshUser()
      }
    }, 0)
  })
}
