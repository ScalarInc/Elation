import type { Me } from '@elation/shared/api'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { homeFor, useMe } from '@/data/auth'

/**
 * Gate for signed-in areas (docs/step-03-auth.md). Asks the server who is
 * signed in; signed-out visitors go to /auth (and come back afterwards),
 * staff-only areas bounce clients to their dashboard.
 */
export function ProtectedRoute({ roles }: { roles?: Me['role'][] }) {
  const location = useLocation()
  const { data: me, isPending, isError, refetch } = useMe()

  if (isPending) {
    return (
      <div className="bg-bg flex min-h-screen items-center justify-center">
        <span className="font-display text-text/60 animate-pulse text-lg tracking-[0.3em]">
          ELATION <span className="text-accent">X</span>
        </span>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="bg-bg flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="font-display text-text text-2xl">We can’t reach Elation right now</p>
        <p className="text-muted max-w-sm text-sm">Check your connection — your work is saved on our side.</p>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
          Try again
        </Button>
      </div>
    )
  }

  if (!me) {
    return <Navigate to="/auth?mode=signin" replace state={{ from: location }} />
  }

  if (roles && !roles.includes(me.role)) {
    return <Navigate to={homeFor(me)} replace />
  }

  return <Outlet />
}
