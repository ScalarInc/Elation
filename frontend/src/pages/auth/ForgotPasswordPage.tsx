import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/api'
import { AuthHeading, FormError, SubmitButton, TextField } from '@/components/auth/AuthFields'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.auth.forgotPassword(email.trim())
      setSent(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <>
        <AuthHeading
          title="Check your email"
          subtitle="If an active Elation account uses that address, a reset link is on its way. It can be used once."
        />
        <Link to="/auth" className="text-blush-deep text-sm font-semibold hover:underline">
          ← Back to sign in
        </Link>
      </>
    )
  }

  return (
    <>
      <AuthHeading title="Forgot password" subtitle="We'll email you a link to choose a new one." />
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormError message={error} />
        <TextField label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <SubmitButton busy={busy}>Send reset link</SubmitButton>
        <p className="pt-2 text-center text-xs">
          <Link to="/auth" className="text-ink/60 hover:text-ink">
            Back to sign in
          </Link>
        </p>
      </form>
    </>
  )
}
