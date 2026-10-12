import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AuthHeading, FormError, PasswordField, SubmitButton, TextField } from '@/components/auth/AuthFields'
import { homeFor } from '@/lib/auth'
import { useAuthStore } from '@/stores/authStore'

export function SignInPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { status, user, signIn, loadError } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Already signed in (e.g. opened /auth in a new tab).
  if (status === 'signedIn' && user && !busy) return <Navigate to={homeFor(user.role)} replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email.trim(), password)
      const state = useAuthStore.getState()
      if (state.status === 'blocked') return navigate('/auth/access-ended', { replace: true })
      if (!state.user) throw new Error(state.loadError ?? 'Could not load your account.')
      const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname
      navigate(from ?? homeFor(state.user.role), { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <AuthHeading title="Welcome back" subtitle="Sign in with the account Elation created for you." />
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormError message={error ?? loadError} />
        <TextField label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <PasswordField label="Password" value={password} onChange={setPassword} />
        <div className="flex justify-end pt-1">
          <Link to="/auth/forgot-password" className="text-blush-deep text-xs font-semibold hover:underline">
            Forgot password?
          </Link>
        </div>
        <SubmitButton busy={busy}>Sign in</SubmitButton>
        <p className="pt-4 text-center text-xs text-ink/50">
          Accounts are by invitation only. Contact your Elation consultant for access.
        </p>
      </form>
    </>
  )
}
