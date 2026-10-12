import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { AuthHeading, FormError, PasswordField, SubmitButton } from '@/components/auth/AuthFields'
import { Spinner } from '@/components/ui/spinner'
import { homeFor, MIN_PASSWORD_LENGTH } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

/**
 * Landing page for one-time links from emails:
 *  - mode "set":   invitation link (first password)
 *  - mode "reset": forgot-password link
 * Supabase signs the user in from the link (tokens in the URL), then we set the password.
 */
export function SetPasswordPage({ mode }: { mode: 'set' | 'reset' }) {
  const navigate = useNavigate()
  const { status, refreshUser } = useAuthStore()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Supabase reports bad links in the URL hash, e.g. #error_code=otp_expired.
  const [linkError] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('error_description'))
  // The link signs the user in with Supabase. Check that directly (not our API), so a
  // backend problem is never mistaken for an expired link.
  const [linkEmail, setLinkEmail] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setLinkEmail(data.session?.user.email ?? null))
  }, [])

  if (linkEmail === undefined) return <Spinner size="lg" />
  if (status === 'blocked') return <Navigate to="/auth/access-ended" replace />
  if (linkError || linkEmail === null) {
    return (
      <>
        <AuthHeading
          title="Link expired"
          subtitle="This link is invalid, already used or expired. Ask Elation to send a new invitation, or request a new reset link."
        />
        <Link to="/auth/forgot-password" className="text-blush-deep text-sm font-semibold hover:underline">
          Request a new link →
        </Link>
      </>
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (password.length < MIN_PASSWORD_LENGTH) return setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`)
    if (password !== confirm) return setError('Passwords do not match.')
    setBusy(true)
    setError(null)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setBusy(false)
      return setError(updateError.message)
    }
    await refreshUser()
    const { user: current, loadError } = useAuthStore.getState()
    if (!current && useAuthStore.getState().status !== 'blocked') {
      // Password is saved; only loading the account failed (e.g. backend offline).
      setBusy(false)
      return setError(`Password saved, but your account couldn't load: ${loadError ?? 'unknown error'}. Try signing in.`)
    }
    navigate(current ? homeFor(current.role) : '/auth/access-ended', { replace: true })
  }

  return (
    <>
      <AuthHeading
        title={mode === 'set' ? 'Set your password' : 'Choose a new password'}
        subtitle={`For ${linkEmail}`}
      />
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormError message={error} />
        <PasswordField label="New password" value={password} onChange={setPassword} autoComplete="new-password" />
        <PasswordField label="Confirm password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        <p className="text-xs text-ink/50">At least {MIN_PASSWORD_LENGTH} characters.</p>
        <SubmitButton busy={busy}>{mode === 'set' ? 'Save and continue' : 'Update password'}</SubmitButton>
      </form>
    </>
  )
}
