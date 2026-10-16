import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CategoryProgress } from '@/stores/questionnaireStore'

type Props = {
  progress: CategoryProgress[]
  activeSlug: string
  onSelect: (slug: string) => void
}

/**
 * Grouped rail — five phases so the client sees the shape of the journey
 * instead of a flat 24-item wall. Grouping is UI-only; the underlying
 * category list stays exactly as defined in schema.ts.
 */
const PHASES: { label: string; range: [number, number]; hint: string }[] = [
  { label: 'The essentials', range: [1, 1], hint: 'What are we building?' },
  { label: 'Design direction', range: [2, 3], hint: 'Aesthetic and palette' },
  { label: 'Decor foundations', range: [4, 11], hint: 'Big surfaces and seating' },
  { label: 'Detail & atmosphere', range: [12, 18], hint: 'The layered touches' },
  { label: 'Culture, budget & brief', range: [19, 24], hint: 'Wrapping up' },
]

export function CategoryRail({ progress, activeSlug, onSelect }: Props) {
  const inPhase = (order: number, phase: typeof PHASES[number]) =>
    order >= phase.range[0] && order <= phase.range[1]

  return (
    <div className="space-y-6">
      {PHASES.map((phase) => {
        const items = progress.filter((p) => inPhase(p.order, phase))
        const phaseComplete = items.every((i) => i.isComplete)
        const phaseTotalAnswered = items.reduce((a, i) => a + i.answeredCount, 0)
        const phaseTotalVisible = items.reduce((a, i) => a + i.visibleCount, 0)
        const phasePercent =
          phaseTotalVisible === 0
            ? 0
            : Math.round((phaseTotalAnswered / phaseTotalVisible) * 100)

        return (
          <section key={phase.label}>
            <header className="mb-2.5 flex items-center justify-between px-3">
              <div>
                <p className="font-display text-text text-[13px] leading-tight tracking-tight">
                  {phase.label}
                </p>
                <p className="text-muted/60 text-[10px]">{phase.hint}</p>
              </div>
              <span
                className={cn(
                  'text-[10px] font-bold uppercase tracking-widest tabular-nums',
                  phaseComplete ? 'text-success' : 'text-muted/70',
                )}
              >
                {phaseComplete ? 'DONE' : `${phasePercent}%`}
              </span>
            </header>

            <ol className="space-y-0.5">
              {items.map((c) => {
                const isActive = c.slug === activeSlug
                return (
                  <li key={c.slug}>
                    <button
                      type="button"
                      onClick={() => onSelect(c.slug)}
                      className={cn(
                        'group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition',
                        isActive
                          ? 'bg-accent/15 shadow-inner-soft'
                          : 'hover:bg-surface-2',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold transition',
                          c.isComplete
                            ? 'border-success bg-success text-white'
                            : c.isStarted
                            ? 'border-accent text-accent'
                            : 'border-border/25 text-muted/70',
                        )}
                      >
                        {c.isComplete ? (
                          <Check className="h-3 w-3" strokeWidth={3} />
                        ) : (
                          c.order
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            'truncate text-sm transition',
                            isActive
                              ? 'text-text font-semibold'
                              : 'text-muted group-hover:text-text',
                          )}
                        >
                          {c.title}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <div className="bg-border/10 h-1 flex-1 overflow-hidden rounded-full">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all',
                                c.isComplete ? 'bg-success' : 'bg-accent',
                              )}
                              style={{ width: `${c.percent}%` }}
                            />
                          </div>
                          <span className="text-muted/60 text-[9px] tabular-nums">
                            {c.visibleCount === 0 ? 'Not needed' : `${c.answeredCount}/${c.visibleCount}`}
                          </span>
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ol>
          </section>
        )
      })}
    </div>
  )
}
