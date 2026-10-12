import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Eye, EyeOff, Check, ArrowRight, AlertCircle, Sparkles } from 'lucide-react'
import { PASSWORD_MIN_LENGTH, type InviteLookup } from '@elation/shared/api'
import { cn } from '@/lib/utils'

export type AuthMode = 'signin' | 'activate'

export function TextField({
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  required,
  readOnly,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  autoComplete?: string
  required?: boolean
  readOnly?: boolean
}) {
  const filled = value.length > 0
  return (
    <label className="group relative block">
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        readOnly={readOnly}
        placeholder=" "
        className={cn(
          'border-ink/15 focus:border-blush-deep peer w-full rounded-xl border bg-white/80 px-4 pb-2.5 pt-5 text-sm text-ink outline-none transition',
          readOnly && 'bg-ink/[0.03] text-ink/70',
        )}
      />
      <span
        className={cn(
          'text-ink/50 pointer-events-none absolute left-4 text-sm transition-all',
          filled
            ? 'top-1.5 text-[10px] font-bold uppercase tracking-widest'
            : 'top-1/2 -translate-y-1/2 peer-focus:top-1.5 peer-focus:-translate-y-0 peer-focus:text-[10px] peer-focus:font-bold peer-focus:uppercase peer-focus:tracking-widest',
        )}
      >
        {label}
      </span>
    </label>
  )
}

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete = 'current-password',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  autoComplete?: string
}) {
  const [show, setShow] = useState(false)
  const filled = value.length > 0
  return (
    <label className="group relative block">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required
        placeholder=" "
        className="border-ink/15 focus:border-blush-deep peer w-full rounded-xl border bg-white/80 px-4 pb-2.5 pr-11 pt-5 text-sm text-ink outline-none transition"
      />
      <span
        className={cn(
          'text-ink/50 pointer-events-none absolute left-4 text-sm transition-all',
          filled
            ? 'top-1.5 text-[10px] font-bold uppercase tracking-widest'
            : 'top-1/2 -translate-y-1/2 peer-focus:top-1.5 peer-focus:-translate-y-0 peer-focus:text-[10px] peer-focus:font-bold peer-focus:uppercase peer-focus:tracking-widest',
        )}
      >
        {label}
      </span>
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        className="text-ink/50 hover:text-ink absolute right-3 top-1/2 -translate-y-1/2 transition"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </label>
  )
}

function Checkbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  children: ReactNode
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-xs text-ink/70">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'flex h-4 w-4 items-center justify-center rounded border transition',
          checked ? 'bg-blush-deep border-blush-deep' : 'border-ink/25 bg-white hover:border-ink/40',
        )}
      >
        {checked && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
      </button>
      <span>{children}</span>
    </label>
  )
}

export function FormError({ message }: { message: string | null | undefined }) {
  return (
    <AnimatePresence initial={false}>
      {message && (
        <motion.p
          role="alert"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="flex items-start gap-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-xs leading-relaxed text-red-700"
        >
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
          {message}
        </motion.p>
      )}
    </AnimatePresence>
  )
}

export function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-blush-deep hover:bg-blush-deep/95 mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold tracking-wide text-white shadow-sm transition disabled:cursor-wait disabled:opacity-70"
    >
      {pending ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
      ) : (
        <>
          {children}
          <ArrowRight className="h-4 w-4" />
        </>
      )}
    </button>
  )
}

type AuthSwitchProps = {
  mode: AuthMode
  onModeChange: (m: AuthMode) => void
  initialCode: string
  /** Invitation found for the code (prefills the activation form). */
  invite: InviteLookup | undefined
  onCodeChange: (code: string) => void
  onSignIn: (data: { email: string; password: string; remember: boolean }) => void
  onActivate: (data: { code: string; name: string; password: string }) => void
  pending: boolean
  error: string | null
  className?: string
}

/** Sign-in and invitation-activation forms. Accounts are invite-only — no open sign-up. */
export function AuthSwitch({
  mode,
  onModeChange,
  initialCode,
  invite,
  onCodeChange,
  onSignIn,
  onActivate,
  pending,
  error,
  className,
}: AuthSwitchProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [invitation, setInvitation] = useState(initialCode)
  const [remember, setRemember] = useState(true)
  const [terms, setTerms] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  // Prefill from the invitation once it's found.
  useEffect(() => {
    if (invite) {
      setName((n) => n || invite.name)
      setEmail(invite.email)
    }
  }, [invite])

  const isActivate = mode === 'activate'

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLocalError(null)
    if (!isActivate) {
      onSignIn({ email, password, remember })
      return
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      setLocalError(`Use at least ${PASSWORD_MIN_LENGTH} characters for your password.`)
      return
    }
    if (password !== confirm) {
      setLocalError('The two passwords don’t match.')
      return
    }
    if (!terms) {
      setLocalError('Please accept the Terms & Conditions to continue.')
      return
    }
    onActivate({ code: invitation.trim(), name: name.trim(), password })
  }

  return (
    <div className={cn('w-full max-w-md', className)}>
      <div className="mb-8">
        <h1 className="font-display text-[42px] leading-none text-ink">
          {isActivate ? 'Activate your studio' : 'Welcome back'}
        </h1>
        <p className="mt-3 text-sm text-ink/60">
          {isActivate ? 'Already activated?' : 'Received an invitation from Elation?'}{' '}
          <button
            type="button"
            onClick={() => {
              setLocalError(null)
              onModeChange(isActivate ? 'signin' : 'activate')
            }}
            className="text-blush-deep font-semibold underline underline-offset-4"
          >
            {isActivate ? 'Sign in' : 'Activate it'}
          </button>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <AnimatePresence mode="popLayout" initial={false}>
          {isActivate && (
            <motion.div
              key="invite"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="space-y-3"
            >
              <TextField
                label="Invitation code"
                value={invitation}
                onChange={(v) => {
                  setInvitation(v)
                  onCodeChange(v.trim())
                }}
                required
              />
              {invite && (
                <p className="bg-sage/15 text-ink/80 flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs">
                  <Sparkles className="text-sage-deep h-3.5 w-3.5 shrink-0" />
                  {invite.consultantName
                    ? `${invite.consultantName} has prepared your private studio.`
                    : 'Your private Elation studio is ready.'}
                </p>
              )}
              <TextField label="Full name" value={name} onChange={setName} autoComplete="name" required />
            </motion.div>
          )}
        </AnimatePresence>

        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          required
          readOnly={isActivate}
        />

        <PasswordField
          label={isActivate ? 'Create a password' : 'Password'}
          value={password}
          onChange={setPassword}
          autoComplete={isActivate ? 'new-password' : 'current-password'}
        />

        {isActivate && (
          <PasswordField label="Confirm password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        )}

        {isActivate ? (
          <div className="pt-1">
            <Checkbox checked={terms} onChange={setTerms}>
              I agree to the{' '}
              <a href="#" className="text-ink font-semibold underline underline-offset-2">
                Terms & Conditions
              </a>
            </Checkbox>
          </div>
        ) : (
          <div className="flex items-center justify-between pt-1">
            <Checkbox checked={remember} onChange={setRemember}>
              Remember me
            </Checkbox>
            <Link to="/forgot-password" className="text-blush-deep text-xs font-semibold hover:underline">
              Forgot password?
            </Link>
          </div>
        )}

        <FormError message={localError ?? error} />

        <SubmitButton pending={pending}>{isActivate ? 'Activate my studio' : 'Sign in'}</SubmitButton>

        <p className="pt-4 text-center text-[11px] leading-relaxed text-ink/45">
          Elation X is private. Accounts are created by the Elation team during your consultation.
        </p>
      </form>
    </div>
  )
}

export default AuthSwitch
