import { Navigate, Outlet, useLocation } from 'react-router-dom'

/**
 * Frontend-only auth stub. In the mock phase every route is "authenticated"
 * — flipping localStorage.elation-auth = "off" lets us test the redirect.
 * Real auth wiring is out of scope for this phase (see PLAN.md scope note).
 */
export function ProtectedRoute() {
  const location = useLocation()
  const auth =
    typeof window === 'undefined' ? 'on' : window.localStorage.getItem('elation-auth') ?? 'on'

  if (auth === 'off') {
    return <Navigate to="/auth?mode=signin" replace state={{ from: location }} />
  }
  return <Outlet />
}
