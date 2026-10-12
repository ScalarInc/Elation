import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Spinner } from '@/components/ui/spinner'
import { homeFor } from '@/lib/auth'
import { useAuthStore } from '@/stores/authStore'

/**
 * Guards a route tree: requires a session, active access and the given role.
 * Clients visiting admin pages (and admins visiting client pages) go to their own home.
 */
export function ProtectedRoute({ role }: { role: 'admin' | 'client' }) {
  const location = useLocation()
  const { status, user } = useAuthStore()

  if (status === 'loading') {
    return (
      <div className="bg-bg flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }
  if (status === 'blocked') return <Navigate to="/auth/access-ended" replace />
  if (status === 'signedOut' || !user) return <Navigate to="/auth" replace state={{ from: location }} />
  if (user.role !== role) return <Navigate to={homeFor(user.role)} replace />
  return <Outlet />
}

/** `/` sends signed-in users to their home and everyone else to sign-in. */
export function RootRedirect() {
  const { status, user } = useAuthStore()
  if (status === 'loading') return null
  if (status === 'blocked') return <Navigate to="/auth/access-ended" replace />
  return <Navigate to={user ? homeFor(user.role) : '/auth'} replace />
}
