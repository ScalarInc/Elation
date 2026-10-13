import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ApiError } from './client'

/**
 * Any API call that comes back 401 (session gone) or 403 ACCESS_EXPIRED /
 * ACCESS_REVOKED means the user is no longer signed in: reset `me` so
 * ProtectedRoute sends them to sign-in or the access-ended screen.
 */
let lastServerToast = 0

/** Server trouble (5xx / no connection): one toast at most every 10 s, pages keep their own retry. */
function onServerError(err: unknown) {
  if (!(err instanceof ApiError) || (err.status !== 0 && err.status < 500) || err.code === 'MOCK_MODE') return
  if (Date.now() - lastServerToast < 10_000) return
  lastServerToast = Date.now()
  toast.error(err.status === 0 ? 'You seem to be offline' : 'Something went wrong on our side', {
    description: err.status === 0 ? 'We’ll keep trying — check your connection.' : 'Please try again in a moment.',
  })
}

function onQueryError(err: unknown) {
  onServerError(err)
  onAuthError(err)
}

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
  // Mutations show their own error toasts; failed loads get one shared notice.
  queryCache: new QueryCache({ onError: onQueryError }),
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
