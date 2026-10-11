import { useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Eye, EyeOff, Check, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type Mode = 'signin' | 'signup'

type AuthSwitchProps = {
  mode: Mode
  onModeChange: (m: Mode) => void
  onSubmit?: (data: Record<string, string>) => void
  className?: string
}

function TextField({
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  required,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  autoComplete?: string
  required?: boolean
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
        placeholder=" "
        className="border-ink/15 focus:border-blush-deep peer w-full rounded-xl border bg-white/80 px-4 pb-2.5 pt-5 text-sm text-ink outline-none transition"
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

function PasswordField({
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
  children: React.ReactNode
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
          checked
            ? 'bg-blush-deep border-blush-deep'
            : 'border-ink/25 bg-white hover:border-ink/40',
        )}
      >
        {checked && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
      </button>
      <span>{children}</span>
    </label>
  )
}

function SocialButton({
  provider,
  onClick,
}: {
  provider: 'google' | 'apple'
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-ink/15 bg-white hover:border-ink/30 flex flex-1 items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold text-ink transition"
    >
      {provider === 'google' ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
          <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.4-1.6 4-5.5 4-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.9 1.5L18.7 4.8C16.9 3.1 14.6 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.2-.2-2H12z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-ink" aria-hidden>
          <path d="M16.4 12.7c0-2.4 2-3.6 2.1-3.6-1.2-1.7-2.9-2-3.6-2-1.5-.2-3 .9-3.8.9-.8 0-2-.9-3.3-.9-1.7 0-3.3 1-4.1 2.5-1.7 3-.5 7.4 1.2 9.9.9 1.2 2 2.6 3.4 2.5 1.4-.1 1.9-.9 3.5-.9s2.1.9 3.5.9c1.5 0 2.4-1.2 3.2-2.4.9-1.4 1.3-2.7 1.3-2.7 0-.1-2.5-.9-2.5-3.7zM13.5 5.4c.7-.9 1.2-2.1 1.1-3.4-1.1 0-2.4.7-3.1 1.6-.7.7-1.3 2-1.1 3.2 1.2.1 2.4-.6 3.1-1.4z" />
        </svg>
      )}
      {provider === 'google' ? 'Google' : 'Apple'}
    </button>
  )
}

export function AuthSwitch({
  mode,
  onModeChange,
  onSubmit,
  className,
}: AuthSwitchProps) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [invitation, setInvitation] = useState('')
  const [remember, setRemember] = useState(true)
  const [terms, setTerms] = useState(false)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onSubmit?.({ firstName, lastName, email, password, invitation })
  }

  const isSignup = mode === 'signup'

  return (
    <div className={cn('w-full max-w-md', className)}>
      <div className="mb-8">
        <h1 className="font-display text-[42px] leading-none text-ink">
          {isSignup ? 'Create an account' : 'Welcome back'}
        </h1>
        <p className="mt-3 text-sm text-ink/60">
          {isSignup ? 'Already have an account?' : 'New to Elation?'}{' '}
          <button
            type="button"
            onClick={() => onModeChange(isSignup ? 'signin' : 'signup')}
            className="text-blush-deep font-semibold underline underline-offset-4"
          >
            {isSignup ? 'Log in' : 'Create an account'}
          </button>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <AnimatePresence mode="popLayout" initial={false}>
          {isSignup && (
            <motion.div
              key="names"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="grid grid-cols-2 gap-3"
            >
              <TextField
                label="First name"
                value={firstName}
                onChange={setFirstName}
                autoComplete="given-name"
                required
              />
              <TextField
                label="Last name"
                value={lastName}
                onChange={setLastName}
                autoComplete="family-name"
                required
              />
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
        />

        <AnimatePresence mode="popLayout" initial={false}>
          {isSignup && (
            <motion.div
              key="invite"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              <TextField
                label="Invitation code"
                value={invitation}
                onChange={setInvitation}
                required
              />
            </motion.div>
          )}
        </AnimatePresence>

        <PasswordField
          label={isSignup ? 'Create a password' : 'Password'}
          value={password}
          onChange={setPassword}
          autoComplete={isSignup ? 'new-password' : 'current-password'}
        />

        {isSignup ? (
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
            <a
              href="#"
              className="text-blush-deep text-xs font-semibold hover:underline"
            >
              Forgot password?
            </a>
          </div>
        )}

        <button
          type="submit"
          className="bg-blush-deep hover:bg-blush-deep/95 mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold tracking-wide text-white shadow-sm transition"
        >
          {isSignup ? 'Create account' : 'Sign in'}
          <ArrowRight className="h-4 w-4" />
        </button>

        <div className="mt-5 flex items-center gap-3">
          <span className="bg-ink/10 h-px flex-1" />
          <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-ink/50">
            Or {isSignup ? 'register' : 'sign in'} with
          </span>
          <span className="bg-ink/10 h-px flex-1" />
        </div>

        <div className="flex gap-3 pt-2">
          <SocialButton provider="google" />
          <SocialButton provider="apple" />
        </div>
      </form>
    </div>
  )
}

export default AuthSwitch
