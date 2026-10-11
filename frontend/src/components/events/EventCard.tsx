import { Link } from 'react-router-dom'
import { ArrowUpRight, Calendar, MapPin, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { formatDate, formatPKRCompact, daysUntil } from '@/lib/format'
import type { ClientEvent, ModuleStatus } from '@/types'

const weight: Record<ModuleStatus, number> = { complete: 1, in_progress: 0.5, pending: 0 }

function progressPct(e: ClientEvent) {
  const p = e.progress
  return Math.round(
    ((weight[p.questionnaire] + weight[p.moodboard] + weight[p.budget] + weight[p.ar]) / 4) * 100,
  )
}

function statusBadge(status: ClientEvent['status']) {
  switch (status) {
    case 'active':
      return <Badge variant="sage">Active</Badge>
    case 'draft':
      return <Badge variant="warning">Draft</Badge>
    case 'past':
      return <Badge variant="outline">Past</Badge>
  }
}

type Props = { event: ClientEvent; className?: string }

export function EventCard({ event, className }: Props) {
  const pct = progressPct(event)
  const days = daysUntil(event.date)

  return (
    <Link
      to={`/events/${event.id}`}
      className={cn(
        'group bg-cream-panel border-border/10 shadow-card hover:shadow-soft flex flex-col overflow-hidden rounded-3xl border transition hover:-translate-y-0.5',
        className,
      )}
    >
      <div className="relative h-44 overflow-hidden">
        <img
          src={event.coverImage}
          alt={event.name}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
        <div className="absolute inset-x-4 top-4 flex items-center justify-between">
          <Badge variant="accent" className="bg-white/85 text-ink">
            {event.type}
          </Badge>
          {statusBadge(event.status)}
        </div>
        <div className="absolute inset-x-4 bottom-3 text-white">
          <p className="font-display text-lg leading-tight drop-shadow">
            {event.concept ?? event.name}
          </p>
        </div>
        <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 opacity-0 shadow-md transition group-hover:opacity-100">
          <ArrowUpRight className="text-ink h-4 w-4" />
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <ul className="text-muted space-y-1.5 text-xs">
          <li className="flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5" />
            {formatDate(event.date)}
            {event.status !== 'past' && (
              <span className="text-muted/60">· {days} days to go</span>
            )}
          </li>
          <li className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5" />
            {event.venue.name} · {event.venue.city}
          </li>
          <li className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5" />
            {event.guests} guests · {formatPKRCompact(event.budgetPKR)}
          </li>
        </ul>

        <div>
          <div className="text-muted/70 mb-1.5 flex items-center justify-between text-[10px] font-bold tracking-widest">
            <span>PROGRESS</span>
            <span>{pct}%</span>
          </div>
          <Progress value={pct} />
        </div>
      </div>
    </Link>
  )
}
