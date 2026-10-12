import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { ApiError } from './client'

/**
 * Any API call that comes back 401 (session gone) or 403 ACCESS_EXPIRED /
 * ACCESS_REVOKED means the user is no longer signed in: reset `me` so
 * ProtectedRoute sends them to sign-in or the access-ended screen.
 */
function onAuthError(err: unknown) {
  if (!(err instanceof ApiError)) return
  if (err.status === 401) {
    queryClient.setQueryData(['me'], null)
  } else if (err.code === 'ACCESS_EXPIRED' || err.code === 'ACCESS_REVOKED') {
    queryClient.setQueryData(['me'], null)
    window.location.assign(`/access-ended?reason=${err.code === 'ACCESS_REVOKED' ? 'revoked' : 'expired'}`)
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onAuthError }),
  mutationCache: new MutationCache({ onError: onAuthError }),
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      refetchOnWindowFocus: false,
      // Never retry 4xx — they won't fix themselves.
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
})
