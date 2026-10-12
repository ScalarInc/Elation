import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Archive,
  ArchiveRestore,
  ArrowUpRight,
  Calculator,
  Calendar,
  ClipboardList,
  Copy,
  MapPin,
  MoreHorizontal,
  Palette,
  Trash2,
  Users,
} from 'lucide-react'
import { overallProgressPercent } from '@elation/shared/events'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from '@/components/ui/toast'
import { useArchiveEvent, useDeleteEvent, useDuplicateEvent } from '@/data/events'
import { cn } from '@/lib/utils'
import { formatBudget, formatDate, daysUntil } from '@/lib/format'
import type { ClientEvent } from '@/mocks/types'

function statusBadge(status: ClientEvent['status']) {
  switch (status) {
    case 'active':
      return <Badge variant="sage">Active</Badge>
    case 'draft':
      return <Badge variant="warning">Draft</Badge>
    case 'past':
      return <Badge variant="outline">Past</Badge>
    case 'archived':
      return <Badge variant="outline">Archived</Badge>
  }
}

/** Quick actions: jump straight into a module, or manage the event. */
function EventActions({ event }: { event: ClientEvent }) {
  const navigate = useNavigate()
  const duplicate = useDuplicateEvent()
  const archive = useArchiveEvent()
  const remove = useDeleteEvent()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const archived = event.status === 'archived'
  const name = event.concept ?? event.name

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Actions for ${name}`}
            className="bg-surface/90 text-text absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full shadow-sm transition hover:bg-surface"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={() => navigate(`/events/${event.id}/questionnaire`)}>
            <ClipboardList className="h-4 w-4" />
            Questionnaire
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => navigate(`/events/${event.id}?tab=moodboard`)}>
            <Palette className="h-4 w-4" />
            Moodboard
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => navigate(`/events/${event.id}/budget?from=events`)}>
            <Calculator className="h-4 w-4" />
            Budget estimator
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() =>
              duplicate.mutate(event.id, {
                onSuccess: (copy) => toast.success(`Created ${copy.concept ?? copy.name}`),
                onError: (err) => toast.error('Could not duplicate', { description: err.message }),
              })
            }
          >
            <Copy className="h-4 w-4" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              archive.mutate(
                { id: event.id, archived: !archived },
                {
                  onSuccess: () => toast.success(archived ? `${name} restored` : `${name} archived`),
                  onError: (err) => toast.error('Could not update event', { description: err.message }),
                },
              )
            }
          >
            {archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            {archived ? 'Unarchive' : 'Archive'}
          </DropdownMenuItem>
          {event.status === 'draft' && (
            <DropdownMenuItem className="text-danger" onSelect={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" />
              Delete draft
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {name}?</DialogTitle>
            <DialogDescription>
              This draft and its questionnaire answers will be removed. Events you’ve started
              working on can be archived instead.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(event.id, {
                  onSuccess: () => {
                    setConfirmDelete(false)
                    toast.success(`${name} deleted`)
                  },
                  onError: (err) => toast.error('Could not delete', { description: err.message }),
                })
              }
            >
              {remove.isPending ? 'Deleting…' : 'Delete draft'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

type Props = { event: ClientEvent; className?: string }

export function EventCard({ event, className }: Props) {
  const pct = overallProgressPercent(event.progress)
  const days = daysUntil(event.date)

  return (
    <div className={cn('group relative', className)}>
      <EventActions event={event} />
      <Link
        to={`/events/${event.id}`}
        className="bg-cream-panel border-border/10 shadow-card hover:shadow-soft flex h-full flex-col overflow-hidden rounded-3xl border transition hover:-translate-y-0.5"
      >
        <div className="relative h-44 overflow-hidden">
          <img
            src={event.coverImage}
            alt={event.name}
            className={cn(
              'h-full w-full object-cover transition duration-500 group-hover:scale-105',
              event.status === 'archived' && 'grayscale',
            )}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
          <div className="absolute left-4 right-14 top-4 flex items-center gap-2">
            <Badge variant="accent" className="bg-white/85 text-ink">
              {event.type}
            </Badge>
            {statusBadge(event.status)}
          </div>
          <div className="absolute inset-x-4 bottom-3 text-white">
            <p className="font-display text-lg leading-tight drop-shadow">{event.concept ?? event.name}</p>
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
              {(event.status === 'active' || event.status === 'draft') && (
                <span className="text-muted/60">· {days} days to go</span>
              )}
            </li>
            <li className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5" />
              {event.venue.name} · {event.venue.city}
            </li>
            <li className="flex items-center gap-2">
              <Users className="h-3.5 w-3.5" />
              {event.guests} guests · {formatBudget(event.budgetPKR)}
            </li>
          </ul>

          <div className="mt-auto">
            <div className="text-muted/70 mb-1.5 flex items-center justify-between text-[10px] font-bold tracking-widest">
              <span>PROGRESS</span>
              <span>{pct}%</span>
            </div>
            <Progress value={pct} />
          </div>
        </div>
      </Link>
    </div>
  )
}
