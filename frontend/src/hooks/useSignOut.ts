import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'

/** Returns a handler that ends the session and goes to the sign-in screen. */
export function useSignOut() {
  const navigate = useNavigate()
  const signOut = useAuthStore((s) => s.signOut)
  return async () => {
    await signOut()
    navigate('/auth', { replace: true })
  }
}
