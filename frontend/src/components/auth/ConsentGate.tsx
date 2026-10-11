import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Lock, ShieldCheck, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

const CONSENT_KEY = 'elation.consent-v1'
const CONSENT_VERSION = 1

type StoredConsent = {
  version: number
  acceptedAt: string
  terms: boolean
  dataUse: boolean
  studioShare: boolean
  marketing: boolean
}

function hasConsented(): boolean {
  if (typeof window === 'undefined') return true
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw) as StoredConsent
    return parsed.version === CONSENT_VERSION && parsed.terms && parsed.dataUse && parsed.studioShare
  } catch {
    return false
  }
}

/**
 * First-run consent gate. Renders nothing if the client already accepted the
 * current terms version. Otherwise blocks the page with a warm, editorial
 * dialog that captures required agreements and an optional marketing opt-in.
 */
export function ConsentGate() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [terms, setTerms] = useState(false)
  const [dataUse, setDataUse] = useState(false)
  const [studioShare, setStudioShare] = useState(false)
  const [marketing, setMarketing] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    // Delay one tick so the layout renders behind, then reveal.
    const t = setTimeout(() => setOpen(!hasConsented()), 250)
    return () => clearTimeout(t)
  }, [])

  const allRequiredChecked = terms && dataUse && studioShare

  function accept() {
    if (!allRequiredChecked) return
    setSubmitting(true)
    const record: StoredConsent = {
      version: CONSENT_VERSION,
      acceptedAt: new Date().toISOString(),
      terms,
      dataUse,
      studioShare,
      marketing,
    }
    // TODO(backend): record consent against the client account; stored locally for now.
    window.localStorage.setItem(CONSENT_KEY, JSON.stringify(record))
    setOpen(false)
    setSubmitting(false)
  }

  function decline() {
    setOpen(false)
    toast('You can accept later to continue. See you soon.', { duration: 3000 })
    navigate('/auth?mode=signin', { replace: true })
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm"
          />

          {/* Dialog */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="consent-title"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-[101] flex items-center justify-center p-4"
          >
            <div className="border-border/10 bg-surface shadow-lift relative w-full max-w-2xl overflow-hidden rounded-3xl border">
              {/* Ambient blushes */}
              <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-accent/25 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-sage/20 blur-3xl" />

              {/* Header */}
              <header className="relative border-b border-border/10 px-8 pb-6 pt-8">
                <div className="flex items-start gap-4">
                  <span className="bg-accent/20 text-accent flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl">
                    <Sparkles className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">
                      Before we begin
                    </p>
                    <h2
                      id="consent-title"
                      className="font-display text-text mt-1 text-3xl leading-tight"
                    >
                      A few gentle agreements.
                    </h2>
                    <p className="text-muted mt-2 text-sm leading-relaxed">
                      Elation is a private studio for you and your consultant. Please review how
                      we'll use what you share so we can craft your event well.
                    </p>
                  </div>
                </div>
              </header>

              {/* Body */}
              <div className="relative max-h-[55vh] overflow-y-auto px-8 py-6">
                <div className="space-y-4">
                  <ConsentCard
                    checked={terms}
                    onChange={setTerms}
                    required
                    icon={<ShieldCheck className="h-4 w-4" />}
                    title="Terms of Service & Privacy"
                    body="I've read and agree to Elation's Terms of Service and Privacy Policy. I understand my studio is private — accounts are issued by Elation and not publicly discoverable."
                  />
                  <ConsentCard
                    checked={dataUse}
                    onChange={setDataUse}
                    required
                    icon={<Sparkles className="h-4 w-4" />}
                    title="Elation may curate from my answers"
                    body="I consent to my questionnaire answers, uploaded images and stated preferences being used by Elation to generate moodboards, budget suggestions and AR previews for my event."
                  />
                  <ConsentCard
                    checked={studioShare}
                    onChange={setStudioShare}
                    required
                    icon={<Lock className="h-4 w-4" />}
                    title="Sharing inside the Elation studio"
                    body="I understand my consultant, the production team and the design studio may access my studio to build the event. My data is never sold, and never shared outside Elation."
                  />
                  <ConsentCard
                    checked={marketing}
                    onChange={setMarketing}
                    icon={<Check className="h-4 w-4" />}
                    title="Occasional updates (optional)"
                    body="Send me the seasonal Elation lookbook and a short note when a new set of concepts drops. You can turn this off any time in Settings."
                  />
                </div>

                <p className="text-muted/60 mt-6 text-[11px] leading-relaxed">
                  You can revisit or revoke these agreements from{' '}
                  <span className="text-muted">Settings → Data</span> at any time. This consent
                  screen only appears once per account.
                </p>
              </div>

              {/* Footer */}
              <footer className="relative flex flex-col items-stretch gap-3 border-t border-border/10 bg-surface-2/50 px-8 py-5 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={decline}
                  className="text-muted hover:text-danger inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest transition"
                >
                  <X className="h-3.5 w-3.5" />
                  Decline & sign out
                </button>
                <Button
                  onClick={accept}
                  disabled={!allRequiredChecked || submitting}
                  className={cn(
                    'min-w-[12rem] transition',
                    !allRequiredChecked && 'opacity-60',
                  )}
                  size="lg"
                >
                  {submitting ? 'Preparing your studio…' : 'Accept & continue'}
                </Button>
              </footer>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// -----------------------------------------------------------------------------

function ConsentCard({
  checked,
  onChange,
  required,
  icon,
  title,
  body,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  required?: boolean
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <label
      className={cn(
        'group flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition',
        checked
          ? 'border-accent/40 bg-accent/5'
          : 'border-border/10 bg-surface hover:border-accent/25 hover:bg-accent/5',
      )}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={(next) => onChange(Boolean(next))}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-accent bg-accent/15 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
            {icon}
          </span>
          <p className="text-text text-sm font-semibold">
            {title}
            {required && <span className="text-accent ml-1">*</span>}
          </p>
        </div>
        <p className="text-muted mt-1.5 text-xs leading-relaxed">{body}</p>
      </div>
    </label>
  )
}
