import { Link } from 'react-router-dom'
import { ArrowRight, Sparkles } from 'lucide-react'
import { motion } from 'framer-motion'
import type { ClientEvent } from '@/mocks/types'

/** Button label for the step's destination. */
function ctaFor(href: string) {
  if (href.endsWith('/questionnaire')) return 'Continue'
  if (href.includes('tab=moodboard')) return 'Open moodboard'
  if (href.endsWith('/budget')) return 'Open estimator'
  if (href.endsWith('/ar')) return 'Open AR studio'
  return 'Open event'
}

export function NextStepCard({ event }: { event: ClientEvent }) {
  const step = { ...event.nextStep, cta: ctaFor(event.nextStep.href) }

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.1 }}
      className="border-border/10 shadow-card relative flex flex-col justify-between overflow-hidden rounded-3xl border bg-gradient-to-br from-accent/10 via-surface to-surface p-6"
    >
      <div className="absolute -top-8 -right-8 h-40 w-40 rounded-full bg-accent/20 blur-3xl" aria-hidden />
      <div className="relative">
        <p className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">
          Next step
        </p>
        <h2 className="font-display text-text mt-1 text-xl">Pick up where you left off.</h2>

        <div className="border-accent/30 bg-surface mt-5 flex items-start gap-3 rounded-2xl border p-4 shadow-soft">
          <span className="bg-accent/20 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
            <Sparkles className="text-accent h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-text text-sm font-semibold">{step.title}</p>
            <p className="text-muted mt-1 text-xs leading-relaxed">{step.body}</p>
          </div>
        </div>
      </div>

      <Link
        to={step.href}
        className="bg-accent text-accent-fg mt-5 inline-flex w-fit items-center gap-2 self-start rounded-xl px-5 py-2.5 text-xs font-bold uppercase tracking-widest shadow-sm transition hover:brightness-95"
      >
        {step.cta}
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </motion.section>
  )
}
