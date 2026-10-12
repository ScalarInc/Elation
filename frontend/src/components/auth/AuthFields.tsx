import { useState, type ReactNode } from 'react'
import { ArrowRight, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Shared building blocks for the /auth/* screens (floating-label fields, heading, submit). */

const labelClass = (filled: boolean) =>
  cn(
    'text-ink/50 pointer-events-none absolute left-4 text-sm transition-all',
    filled
      ? 'top-1.5 text-[10px] font-bold uppercase tracking-widest'
      : 'top-1/2 -translate-y-1/2 peer-focus:top-1.5 peer-focus:-translate-y-0 peer-focus:text-[10px] peer-focus:font-bold peer-focus:uppercase peer-focus:tracking-widest',
  )

const inputClass =
  'border-ink/15 focus:border-blush-deep peer w-full rounded-xl border bg-white/80 px-4 pb-2.5 pt-5 text-sm text-ink outline-none transition'

type FieldProps = {
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete?: string
}

export function TextField({ label, value, onChange, autoComplete, type = 'text' }: FieldProps & { type?: string }) {
  return (
    <label className="relative block">
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required
        placeholder=" "
        className={inputClass}
      />
      <span className={labelClass(value.length > 0)}>{label}</span>
    </label>
  )
}

export function PasswordField({ label, value, onChange, autoComplete = 'current-password' }: FieldProps) {
  const [show, setShow] = useState(false)
  return (
    <label className="relative block">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required
        placeholder=" "
        className={cn(inputClass, 'pr-11')}
      />
      <span className={labelClass(value.length > 0)}>{label}</span>
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

export function AuthHeading({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <div className="mb-8">
      <h1 className="font-display text-[40px] leading-none text-ink">{title}</h1>
      {subtitle && <p className="mt-3 text-sm text-ink/60">{subtitle}</p>}
    </div>
  )
}

export function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="bg-blush-deep hover:bg-blush-deep/95 mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold tracking-wide text-white shadow-sm transition disabled:opacity-60"
    >
      {busy ? 'Please wait…' : children}
      {!busy && <ArrowRight className="h-4 w-4" />}
    </button>
  )
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
      {message}
    </p>
  )
}
