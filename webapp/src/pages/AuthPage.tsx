import { useState } from 'react'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthShell } from '@/components/AuthShell'
import { AuthSwitch, type AuthMode } from '@/components/ui/auth-switch'
import { homeFor, useAcceptInvite, useInviteLookup, useLogin, useMe } from '@/data/auth'
import { isApiError } from '@/lib/api/client'

/**
 * /auth — sign in, or activate an invitation (`?mode=activate&code=…`, the link
 * in the invite email). There is no open sign-up: accounts are admin-issued.
 */
export function AuthPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const initialCode = params.get('code') ?? ''
  const mode: AuthMode = params.get('mode') === 'activate' || initialCode ? 'activate' : 'signin'

  const [code, setCode] = useState(initialCode)
  const { data: me } = useMe()
  const invite = useInviteLookup(mode === 'activate' ? code : null)
  const login = useLogin()
  const accept = useAcceptInvite()

  // Where ProtectedRoute bounced the user from, if anywhere.
  const from = (location.state as { from?: { pathname: string; search?: string } } | null)?.from
  const after = (role: Parameters<typeof homeFor>[0]) =>
    from && from.pathname !== '/auth' ? `${from.pathname}${from.search ?? ''}` : homeFor(role)

  if (me) return <Navigate to={after(me)} replace />

  function setMode(next: AuthMode) {
    login.reset()
    accept.reset()
    setParams(next === 'activate' ? { mode: 'activate' } : {}, { replace: true })
  }

  const inviteError =
    mode === 'activate' && invite.isError && isApiError(invite.error, 'INVITE_INVALID')
      ? invite.error.message
      : null
  const error = (mode === 'signin' ? login.error : accept.error) as Error | null

  return (
    <AuthShell>
      <AuthSwitch
        mode={mode}
        onModeChange={setMode}
        initialCode={initialCode}
        invite={invite.data}
        onCodeChange={setCode}
        onSignIn={(data) =>
          login.mutate(data, { onSuccess: (signedIn) => navigate(after(signedIn), { replace: true }) })
        }
        onActivate={(data) =>
          accept.mutate(
            { code: data.code, password: data.password, name: data.name || undefined },
            { onSuccess: (signedIn) => navigate(homeFor(signedIn), { replace: true }) },
          )
        }
        pending={login.isPending || accept.isPending}
        error={error?.message ?? inviteError}
      />
    </AuthShell>
  )
}
