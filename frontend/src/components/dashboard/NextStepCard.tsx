import { Link } from 'react-router-dom'
import { ArrowRight, Sparkles } from 'lucide-react'
import { motion } from 'framer-motion'
import { events } from '@/mocks/fixtures'

function pickNextStep() {
  const e = events[0]
  const p = e.progress
  if (p.questionnaire !== 'complete')
    return {
      title: 'Continue the questionnaire',
      body: "You're a few chapters in — Elation needs the rest to finish the concept.",
      href: `/events/${e.id}/questionnaire`,
      cta: 'Continue',
    }
  if (p.moodboard !== 'complete')
    return {
      title: 'Review your moodboard',
      body: 'Two revised concepts are ready — Concept B leans heavier on florals as you asked.',
      href: `/events/${e.id}?tab=moodboard`,
      cta: 'Open moodboard',
    }
  if (p.budget !== 'complete')
    return {
      title: 'Tune your budget',
      body: 'Everything is priced against real inventory — check the traffic light before you sign off.',
      href: `/events/${e.id}/budget`,
      cta: 'Open estimator',
    }
  return {
    title: 'Preview on Meta Quest 3',
    body: 'Walk your venue in AR passthrough before the first chair is hung.',
    href: `/events/${e.id}/ar`,
    cta: 'Open AR studio',
  }
}

export function NextStepCard() {
  const step = pickNextStep()

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
