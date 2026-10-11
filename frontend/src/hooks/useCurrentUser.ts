import { useEffect, useState } from 'react'
import { api } from '@/api'
import type { ClientUser } from '@/types'

/** The signed-in client, or null while loading / when no session exists. */
export function useCurrentUser(): ClientUser | null {
  const [user, setUser] = useState<ClientUser | null>(null)

  useEffect(() => {
    let cancelled = false
    api.me().then((me) => {
      if (!cancelled) setUser(me)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return user
}
