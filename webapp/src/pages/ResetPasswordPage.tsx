import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { PASSWORD_MIN_LENGTH } from '@elation/shared/api'
import { AuthShell } from '@/components/AuthShell'
import { FormError, PasswordField, SubmitButton } from '@/components/ui/auth-switch'
import { useResetPassword } from '@/data/auth'

/** /reset-password?token=… — the link from the password-reset email. */
export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const reset = useResetPassword()

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setLocalError(null)
    if (password.length < PASSWORD_MIN_LENGTH) {
      setLocalError(`Use at least ${PASSWORD_MIN_LENGTH} characters.`)
      return
    }
    if (password !== confirm) {
      setLocalError('The two passwords don’t match.')
      return
    }
    reset.mutate({ token, password })
  }

  return (
    <AuthShell>
      <div className="w-full max-w-md">
        {reset.isSuccess ? (
          <div>
            <span className="bg-sage/20 text-sage-deep mb-6 flex h-12 w-12 items-center justify-center rounded-2xl">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <h1 className="font-display text-[38px] leading-tight text-ink">Password updated</h1>
            <p className="mt-3 text-sm text-ink/60">
              For your security we signed you out everywhere. Sign in with your new password.
            </p>
            <Link
              to="/auth?mode=signin"
              className="bg-blush-deep mt-8 inline-flex rounded-xl px-6 py-3 text-sm font-bold text-white"
            >
              Sign in
            </Link>
          </div>
        ) : !token ? (
          <div>
            <h1 className="font-display text-[38px] leading-tight text-ink">This link is incomplete</h1>
            <p className="mt-3 text-sm text-ink/60">Open the link from your email again, or request a new one.</p>
            <Link
              to="/forgot-password"
              className="text-blush-deep mt-8 inline-block text-sm font-semibold underline underline-offset-4"
            >
              Request a new link
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="mb-8">
              <h1 className="font-display text-[42px] leading-none text-ink">Choose a new password</h1>
              <p className="mt-3 text-sm text-ink/60">At least {PASSWORD_MIN_LENGTH} characters — a short phrase works well.</p>
            </div>
            <PasswordField label="New password" value={password} onChange={setPassword} autoComplete="new-password" />
            <PasswordField label="Confirm password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
            <FormError message={localError ?? reset.error?.message} />
            {reset.error && (
              <Link to="/forgot-password" className="text-blush-deep block text-xs font-semibold underline underline-offset-4">
                Request a new link
              </Link>
            )}
            <SubmitButton pending={reset.isPending}>Save new password</SubmitButton>
          </form>
        )}
      </div>
    </AuthShell>
  )
}
