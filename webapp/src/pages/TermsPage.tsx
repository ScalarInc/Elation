import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

/**
 * Plain-language summary of how the studio handles personal data, linked from
 * account activation. Elation's legal terms replace it when they're ready (P58).
 */
export function TermsPage() {
  return (
    <div className="bg-bg text-text min-h-screen px-4 py-10 md:px-10">
      <article className="mx-auto max-w-2xl space-y-6">
        <Link to="/auth?mode=signin" className="text-muted hover:text-text inline-flex items-center gap-1 text-sm">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
        </Link>
        <header>
          <p className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">Elation X</p>
          <h1 className="font-display text-3xl">Privacy summary</h1>
          <p className="text-muted mt-2 text-sm">How your private studio handles your information today. Elation’s full terms of service will be published separately.</p>
        </header>
        <section className="space-y-2">
          <h2 className="font-display text-xl">Your studio is private</h2>
          <p className="text-muted text-sm leading-relaxed">
            Accounts are opened by Elation by invitation. Only you, your Elation consultant and Elation’s administrators can see your events, questionnaire answers,
            moodboards, budgets, messages and files.
          </p>
        </section>
        <section className="space-y-2">
          <h2 className="font-display text-xl">Access period</h2>
          <p className="text-muted text-sm leading-relaxed">
            Your studio is open for the period shown on your dashboard (usually 90 days). Your consultant can extend it. When it ends you can no longer sign in;
            how long Elation keeps your data afterwards will be set out in its full terms.
          </p>
        </section>
        <section className="space-y-2">
          <h2 className="font-display text-xl">Photos and files</h2>
          <p className="text-muted text-sm leading-relaxed">
            Files you upload are stored privately and shown through links that expire within 10 minutes. Location and camera details are removed from the copies of
            your photos that appear in the studio.
          </p>
        </section>
        <section className="space-y-2">
          <h2 className="font-display text-xl">Emails</h2>
          <p className="text-muted text-sm leading-relaxed">
            We email you about your account, your consultant’s messages and your quotes. You can switch message emails off in Settings. Marketing emails are sent only
            if you agree to them.
          </p>
        </section>
        <section className="space-y-2">
          <h2 className="font-display text-xl">Cookies</h2>
          <p className="text-muted text-sm leading-relaxed">We use one cookie to keep you signed in. There are no advertising or tracking cookies.</p>
        </section>
      </article>
    </div>
  )
}
