import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Wallet,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/api'
import { formatBudget, formatPKRCompact } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { BudgetSnapshot, BudgetStatus } from '@/types'
import { BUDGET_STATUS_LABEL } from '@/lib/budget'
import { useResolvedEvents } from '@/hooks/useResolvedEvent'

const TONE_STYLES: Record<BudgetStatus, { pill: string; Icon: typeof CheckCircle2 }> = {
  green: { pill: 'bg-success/15 border-success/40 text-success', Icon: CheckCircle2 },
  yellow: { pill: 'bg-warning/15 border-warning/40 text-warning', Icon: AlertTriangle },
  red: { pill: 'bg-danger/15 border-danger/40 text-danger', Icon: AlertOctagon },
  noTarget: { pill: 'bg-surface-2 border-border/20 text-muted', Icon: AlertTriangle },
}

export function BudgetListPage() {
  const events = useResolvedEvents()
  const [loading, setLoading] = useState(true)
  const [snapshots, setSnapshots] = useState<BudgetSnapshot[]>([])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all(events.map((e) => api.budget.forEvent(e.id)))
      .then((snaps) => !cancelled && setSnapshots(snaps))
      .catch(() => !cancelled && setSnapshots([]))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [events])

  const eventById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events])

  // One card per event that has started a budget. Totals come from the server (live prices).
  const rows = useMemo(
    () =>
      snapshots.flatMap((snap) => {
        const event = eventById.get(snap.eventId)
        if (!event || snap.lines.length === 0) return []
        return [{ event, total: snap.totals.totalPkr, budget: snap.budgetPkr, tone: snap.totals.status }]
      }),
    [snapshots, eventById],
  )
  return (
    <div className="px-10 pb-12 pt-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-text text-3xl">Your budgets</h1>
          <p className="text-muted/70 mt-1 text-sm">
            One live estimate per event — traffic-lit against your target.
          </p>
        </div>
      </header>

      {loading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-6 w-6" />}
          title="No budgets yet"
          description="Open an event and start planning — we'll keep the totals live-priced as you go."
          action={
            <Button asChild>
              <Link to="/events">Go to My Events</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(({ event, total, budget, tone }, idx) => {
            const styles = TONE_STYLES[tone]
            const Icon = styles.Icon
            return (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05, duration: 0.35 }}
              >
                <Card className="group flex h-full flex-col overflow-hidden">
                  <div className="relative h-24 overflow-hidden">
                    <img
                      src={event.coverImage}
                      alt={event.name}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                    <div className="absolute inset-x-4 top-3 flex items-center justify-between">
                      <Badge variant="accent" className="bg-white/85 text-ink">
                        {event.type}
                      </Badge>
                      <span
                        className={cn(
                          'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest',
                          styles.pill,
                        )}
                      >
                        <Icon className="h-3 w-3" />
                        {BUDGET_STATUS_LABEL[tone]}
                      </span>
                    </div>
                  </div>

                  <CardContent className="flex flex-1 flex-col gap-4 p-5">
                    <div>
                      <p className="font-display text-text text-lg leading-tight">
                        {event.concept ?? event.name}
                      </p>
                      <p className="text-muted/70 mt-0.5 text-xs">
                        {event.venue.name} · {event.venue.city}
                      </p>
                    </div>

                    <dl className="text-sm">
                      <div className="flex justify-between">
                        <dt className="text-muted">Current total</dt>
                        <dd className="text-text font-semibold tabular-nums">
                          {formatPKRCompact(total)}
                        </dd>
                      </div>
                      <div className="mt-1 flex justify-between">
                        <dt className="text-muted">Budget</dt>
                        <dd className="text-text font-semibold tabular-nums">
                          {formatBudget(budget)}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-auto flex items-center justify-between border-t border-border/10 pt-3">
                      <span className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">
                        {event.status === 'past' ? 'Past event' : 'Live'}
                      </span>
                      <Button asChild variant="ghost" size="sm">
                        <Link to={`/events/${event.id}/budget`}>
                          Open estimator
                          <ArrowRight className="h-3.5 w-3.5" />
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
