import { Check, Loader2, Clock } from 'lucide-react'

type Status = 'complete' | 'in_progress' | 'pending'

const steps: { label: string; status: Status }[] = [
  { label: 'Questionnaire', status: 'complete' },
  { label: 'Moodboard', status: 'in_progress' },
  { label: 'Budget Estimator', status: 'pending' },
  { label: 'AR Visualization', status: 'pending' },
]

const statusMeta: Record<Status, { text: string; className: string; Icon: React.ComponentType<{ className?: string }> }> = {
  complete: { text: 'Complete', className: 'text-sage-deep bg-sage/25', Icon: Check },
  in_progress: { text: 'In Progress', className: 'text-blush-deep bg-blush/40', Icon: Loader2 },
  pending: { text: 'Pending', className: 'text-ink/60 bg-ink/10', Icon: Clock },
}

// Progress = weighted average across 4 steps
const progress = Math.round(((1 + 0.5) / 4) * 100) // 38%

function DonutChart({ percent }: { percent: number }) {
  const r = 46
  const c = 2 * Math.PI * r
  const offset = c - (percent / 100) * c

  return (
    <div className="relative h-32 w-32">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} stroke="#EADFD3" strokeWidth="10" fill="none" />
        <defs>
          <linearGradient id="pg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#D3A79F" />
            <stop offset="100%" stopColor="#9AB1AE" />
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
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-3xl text-ink">{percent}%</span>
        <span className="text-[10px] font-bold tracking-widest text-ink/50">DONE</span>
      </div>
    </div>
  )
}

export function ProgressOverview() {
  return (
    <section className="bg-cream-panel rounded-3xl border border-white/70 p-6 shadow-card">
      <h2 className="font-display text-xl text-ink">Progress Overview</h2>
      <p className="mt-0.5 text-xs text-ink/60">Your journey with Elation so far.</p>

      <div className="mt-5 flex items-center gap-6">
        <DonutChart percent={progress} />

        <ul className="flex-1 space-y-2.5">
          {steps.map(({ label, status }) => {
            const { text, className, Icon } = statusMeta[status]
            return (
              <li key={label} className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-ink">
                  <Icon
                    className={
                      'h-3.5 w-3.5 ' +
                      (status === 'in_progress' ? 'animate-spin text-blush-deep' : 'text-ink/50')
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
    </section>
  )
}
