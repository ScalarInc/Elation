import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CalendarDays, RefreshCw, Sparkles } from 'lucide-react'
import { EventCard } from '@/components/EventCard'
import { NewEventDialog } from '@/components/NewEventDialog'
import { useEventsView } from '@/data/events'
import { useArchivedEvents } from '@/data/events'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { ClientEvent } from '@/mocks/types'

type Filter = 'all' | 'upcoming' | 'draft' | 'past' | 'archived'
type Sort = 'date_asc' | 'date_desc' | 'name'

const filters: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'draft', label: 'Drafts' },
  { key: 'past', label: 'Past' },
  { key: 'archived', label: 'Archived' },
]

function filterEvent(e: ClientEvent, f: Filter) {
  if (f === 'all') return true
  if (f === 'past') return e.status === 'past'
  if (f === 'draft') return e.status === 'draft'
  if (f === 'upcoming') return e.status === 'active'
  if (f === 'archived') return e.status === 'archived'
  return true
}

function sortEvents(list: ClientEvent[], s: Sort) {
  const cp = [...list]
  if (s === 'name') return cp.sort((a, b) => a.name.localeCompare(b.name))
  return cp.sort((a, b) => {
    const diff = a.date.localeCompare(b.date)
    return s === 'date_asc' ? diff : -diff
  })
}

export function MyEventsPage() {
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('date_asc')
  const { events: allEvents, isPending, isError, refetch } = useEventsView()
  const archived = useArchivedEvents(filter === 'archived')

  const filtered = useMemo(() => {
    const source = filter === 'archived' ? (archived.data ?? []) : allEvents
    return sortEvents(source.filter((e) => filterEvent(e, filter)), sort)
  }, [allEvents, archived.data, filter, sort])
  const loading = isPending || (filter === 'archived' && archived.isPending)

  return (
    <div className="px-10 pb-12 pt-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-text text-3xl">My Events</h1>
          <p className="text-muted/70 mt-1 text-sm">
            Every celebration you're planning with Elation.
          </p>
        </div>
        <NewEventDialog />
      </header>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => {
            const isActive = filter === f.key
            const count =
              f.key === 'archived'
                ? archived.data?.length
                : f.key === 'all'
                  ? allEvents.length
                  : allEvents.filter((e) => filterEvent(e, f.key as Filter)).length
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  'rounded-full px-4 py-1.5 text-xs font-semibold tracking-wide transition',
                  isActive
                    ? 'bg-accent text-accent-fg shadow-sm'
                    : 'bg-surface text-muted border-border/10 hover:text-text border',
                )}
              >
                {f.label}
                {count !== undefined && !isPending && (
                  <span className={cn('ml-2 text-[10px] opacity-70', isActive && 'opacity-90')}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2 text-muted text-xs font-semibold uppercase tracking-widest">
          Sort by
          <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
            <SelectTrigger className="h-9 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date_asc">Date · soonest first</SelectItem>
              <SelectItem value="date_desc">Date · latest first</SelectItem>
              <SelectItem value="name">Name · A–Z</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-80 w-full rounded-3xl" />
          ))}
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <p className="font-display text-text text-xl">We couldn’t load your events</p>
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <span className="bg-accent/15 text-accent flex h-14 w-14 items-center justify-center rounded-2xl">
              <CalendarDays className="h-6 w-6" />
            </span>
            <div className="max-w-md">
              <p className="font-display text-text text-xl">
                No events {filter !== 'all' ? `in "${filter}"` : 'yet'}
              </p>
              <p className="text-muted/70 mt-2 text-sm">
                Start your first celebration and Elation will curate a concept, budget, and
                immersive walkthrough around it.
              </p>
            </div>
            {filter !== 'archived' && <NewEventDialog />}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((e, i) => (
            <motion.div
              key={e.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 * i, duration: 0.28 }}
            >
              <EventCard event={e} />
            </motion.div>
          ))}
        </div>
      )}

      {/* Inspiration hint */}
      <Card className="mt-8">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div className="flex items-start gap-3">
            <span className="bg-accent/15 text-accent flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <p className="text-text text-sm font-semibold">Not sure where to start?</p>
              <p className="text-muted mt-0.5 text-xs">
                Browse ready-made concepts and adopt one as the seed for your event.
              </p>
            </div>
          </div>
          <Button variant="outline" asChild>
            <Link to="/inspirations">Explore inspirations</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
