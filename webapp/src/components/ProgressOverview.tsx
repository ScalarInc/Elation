import { Check, Loader2, Clock } from 'lucide-react'
import { motion } from 'framer-motion'
import type { ClientEvent, ModuleStatus } from '@/mocks/types'

const labels: { key: keyof ClientEvent['progress']; label: string }[] = [
  { key: 'questionnaire', label: 'Questionnaire' },
  { key: 'moodboard', label: 'Moodboard' },
  { key: 'budget', label: 'Budget Estimator' },
  { key: 'ar', label: 'AR Visualization' },
]

const statusWeight: Record<ModuleStatus, number> = {
  complete: 1,
  in_progress: 0.5,
  pending: 0,
}

const statusMeta: Record<
  ModuleStatus,
  { text: string; className: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  complete: {
    text: 'Complete',
    className: 'text-success bg-success/15',
    Icon: Check,
  },
  in_progress: {
    text: 'In Progress',
    className: 'text-accent bg-accent/15',
    Icon: Loader2,
  },
  pending: {
    text: 'Pending',
    className: 'text-muted bg-surface-2 border border-border/10',
    Icon: Clock,
  },
}

function DonutChart({ percent }: { percent: number }) {
  const r = 46
  const c = 2 * Math.PI * r
  const offset = c - (percent / 100) * c

  return (
    <div className="relative h-32 w-32">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle
          cx="60"
          cy="60"
          r={r}
          className="text-border/15"
          strokeWidth="10"
          fill="none"
          stroke="currentColor"
        />
        <defs>
          <linearGradient id="pg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgb(var(--accent))" />
            <stop offset="100%" stopColor="rgb(var(--success))" />
          </linearGradient>
        </defs>
        <circle
          cx="60"
          cy="60"
          r={r}
          stroke="url(#pg)"
          strokeWidth="10"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 800ms cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-text text-3xl">{percent}%</span>
        <span className="text-muted/70 text-[10px] font-bold tracking-widest">DONE</span>
      </div>
    </div>
  )
}

export function ProgressOverview({ event }: { event: ClientEvent }) {
  const progress = event.progress
  const totalPercent = Math.round(
    (labels.reduce((sum, { key }) => sum + statusWeight[progress[key]], 0) / labels.length) * 100,
  )

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.05 }}
      className="bg-cream-panel border-border/10 shadow-card rounded-3xl border p-6"
    >
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="font-display text-text text-xl">Progress overview</h2>
          <p className="text-muted/70 mt-0.5 text-xs">Your journey with Elation so far.</p>
        </div>
      </div>

      <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row">
        <DonutChart percent={totalPercent} />

        <ul className="flex-1 space-y-2.5 self-stretch">
          {labels.map(({ key, label }) => {
            const status = progress[key]
            const { text, className, Icon } = statusMeta[status]
            return (
              <li
                key={label}
                className="border-border/10 hover:bg-surface-2 flex items-center justify-between rounded-xl border px-3 py-2 transition"
              >
                <span className="text-text flex items-center gap-2 text-sm">
                  <Icon
                    className={
                      'h-3.5 w-3.5 ' +
                      (status === 'in_progress'
                        ? 'animate-spin text-accent'
                        : status === 'complete'
                        ? 'text-success'
                        : 'text-muted/60')
                    }
                  />
                  {label}
                </span>
                <span
                  className={
                    'rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-widest ' + className
                  }
                >
                  {text.toUpperCase()}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </motion.section>
  )
}
