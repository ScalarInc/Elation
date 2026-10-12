import { Link, useSearchParams } from 'react-router-dom'
import { Hourglass } from 'lucide-react'
import { AuthShell } from '@/components/AuthShell'

/** Shown when the server reports ACCESS_EXPIRED / ACCESS_REVOKED (docs/step-03-auth.md). */
export function AccessEndedPage() {
  const [params] = useSearchParams()
  const revoked = params.get('reason') === 'revoked'

  return (
    <AuthShell>
      <div className="w-full max-w-md">
        <span className="bg-blush/25 text-blush-deep mb-6 flex h-12 w-12 items-center justify-center rounded-2xl">
          <Hourglass className="h-5 w-5" />
        </span>
        <h1 className="font-display text-[38px] leading-tight text-ink">
          {revoked ? 'This account is closed' : 'Your studio access has ended'}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink/60">
          {revoked
            ? 'Elation has closed access to this account. If you think this is a mistake, please reach out to your consultant.'
            : 'Elation X studios are open for the length of your consultation. Your consultant can extend your access — just message them on WhatsApp or email and they’ll reopen it.'}
        </p>
        {!revoked && (
          <p className="mt-3 text-xs text-ink/50">
            Your questionnaire, moodboards and budget are kept for a short while after access ends, so extending soon
            means you pick up exactly where you left off.
          </p>
        )}
        <Link
          to="/auth?mode=signin"
          className="text-blush-deep mt-8 inline-block text-sm font-semibold underline underline-offset-4"
        >
          Back to sign in
        </Link>
      </div>
    </AuthShell>
  )
}
