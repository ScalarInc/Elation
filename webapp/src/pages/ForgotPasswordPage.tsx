import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import { AuthShell } from '@/components/AuthShell'
import { FormError, SubmitButton, TextField } from '@/components/ui/auth-switch'
import { useForgotPassword } from '@/data/auth'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const forgot = useForgotPassword()

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    forgot.mutate(email.trim())
  }

  return (
    <AuthShell>
      <div className="w-full max-w-md">
        {forgot.isSuccess ? (
          <div>
            <span className="bg-sage/20 text-sage-deep mb-6 flex h-12 w-12 items-center justify-center rounded-2xl">
              <MailCheck className="h-5 w-5" />
            </span>
            <h1 className="font-display text-[38px] leading-tight text-ink">Check your inbox</h1>
            <p className="mt-3 text-sm leading-relaxed text-ink/60">
              If <span className="font-semibold text-ink">{email}</span> has an Elation X account, a reset link is on its
              way. It works for 30 minutes.
            </p>
            <Link
              to="/auth?mode=signin"
              className="text-blush-deep mt-8 inline-block text-sm font-semibold underline underline-offset-4"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="mb-8">
              <h1 className="font-display text-[42px] leading-none text-ink">Forgot your password?</h1>
              <p className="mt-3 text-sm text-ink/60">
                Enter the email your invitation was sent to and we’ll send you a reset link.
              </p>
            </div>
            <TextField label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" required />
            <FormError message={forgot.error?.message} />
            <SubmitButton pending={forgot.isPending}>Send reset link</SubmitButton>
            <p className="pt-3 text-center text-xs text-ink/60">
              Remembered it?{' '}
              <Link to="/auth?mode=signin" className="text-blush-deep font-semibold underline underline-offset-4">
                Sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </AuthShell>
  )
}
