import { Outlet } from 'react-router-dom'

/**
 * Route guard for the client area.
 * TODO(backend): check the real session and redirect to /auth when missing or expired.
 * Until auth exists this performs no check.
 */
export function ProtectedRoute() {
  return <Outlet />
}
