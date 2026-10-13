import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Plus, Wallet } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { LoadError } from '@/components/ui/load-error'
import { BUDGET_TONE } from '@/components/budget/tone'
import { useBudgets } from '@/data/budget'
import { formatPKRCompact } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Every event, with its budget or a "Start budget" card (docs/step-08-budget.md, J3/J10). */
export function BudgetListPage() {
  const { data: rows = [], isPending, isError, refetch } = useBudgets()

  return (
    <div className="px-10 pb-12 pt-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-text text-3xl">Your budgets</h1>
          <p className="text-muted/70 mt-1 text-sm">One live estimate per event — traffic-lit against your target.</p>
        </div>
      </header>

      {isPending ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      ) : isError && rows.length === 0 ? (
        <LoadError what="your budgets" onRetry={() => void refetch()} className="py-16" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-6 w-6" />}
          title="No events yet"
          description="Create your first event and Elation will help you shape its budget."
          action={
            <Button asChild>
              <Link to="/events">Go to My Events</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(({ event, plan }, idx) => {
            const tone = plan ? BUDGET_TONE[plan.classification.state] : null
            const Icon = tone?.Icon
            const href = `/events/${event.id}/budget?from=budget`
            return (
              <motion.div key={event.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05, duration: 0.35 }}>
                <Card className="group flex h-full flex-col overflow-hidden">
                  <div className="relative h-24 overflow-hidden">
                    <img src={event.coverImage} alt={event.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                    <div className="absolute inset-x-4 top-3 flex items-center justify-between">
                      <Badge variant="accent" className="bg-white/85 text-ink">
                        {event.type}
                      </Badge>
                      {tone && Icon && (
                        <span className={cn('flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest', tone.pill)}>
                          <Icon className="h-3 w-3" />
                          {tone.label}
                        </span>
                      )}
                    </div>
                  </div>

                  <CardContent className="flex flex-1 flex-col gap-4 p-5">
                    <div>
                      <p className="font-display text-text text-lg leading-tight">{event.concept ?? event.name}</p>
                      <p className="text-muted/70 mt-0.5 text-xs">
                        {event.venue.name} · {event.venue.city}
                      </p>
                    </div>

                    {plan ? (
                      <dl className="text-sm">
                        <div className="flex justify-between">
                          <dt className="text-muted">Current total</dt>
                          <dd className="text-text font-semibold tabular-nums">{formatPKRCompact(plan.totals.includedPkr)}</dd>
                        </div>
                        <div className="mt-1 flex justify-between">
                          <dt className="text-muted">Budget</dt>
                          <dd className="text-text font-semibold tabular-nums">{formatPKRCompact(plan.targetPkr)}</dd>
                        </div>
                      </dl>
                    ) : (
                      <p className="text-muted text-sm">
                        No budget yet. Start from your moodboard or Elation's recommendation — it takes a moment.
                      </p>
                    )}

                    <div className="mt-auto flex items-center justify-between border-t border-border/10 pt-3">
                      <span className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">
                        {plan ? (plan.status === 'draft' ? 'Draft' : 'With your consultant') : event.status === 'past' ? 'Past event' : 'Not started'}
                      </span>
                      <Button asChild variant={plan ? 'ghost' : 'outline'} size="sm">
                        <Link to={href}>
                          {plan ? (
                            <>
                              Open estimator
                              <ArrowRight className="h-3.5 w-3.5" />
                            </>
                          ) : (
                            <>
                              <Plus className="h-3.5 w-3.5" />
                              Start budget
                            </>
                          )}
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default BudgetListPage
