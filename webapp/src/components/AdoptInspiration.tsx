import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import type { InspirationDto } from '@elation/shared/api'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/components/ui/toast'
import { LoadError } from '@/components/ui/load-error'
import { useEventBudget } from '@/data/budget'
import { useEventsView } from '@/data/events'
import { useAdoptInspiration } from '@/data/inspirations'
import { cn } from '@/lib/utils'

/**
 * "Adopt this concept" (docs/step-09-inspirations-ar.md): pick the event, and —
 * when it already has a budget — whether the concept replaces it or adds to it.
 */
export function AdoptInspiration({ inspiration, size = 'lg' }: { inspiration: InspirationDto; size?: 'md' | 'lg' }) {
  const navigate = useNavigate()
  const { events, isError: eventsFailed, refetch: refetchEvents } = useEventsView()
  const [picked, setPicked] = useState<string>('')
  // Prefer an event the concept is made for.
  const eventId = picked || (events.find((e) => inspiration.eventTypes.includes(e.type)) ?? events[0])?.id || ''
  const event = events.find((e) => e.id === eventId)
  const { data: budget } = useEventBudget(eventId || undefined)
  const hasBudget = Boolean(budget?.plan?.lines.length)
  const [mode, setMode] = useState<'merge' | 'replace'>('merge')
  const adopt = useAdoptInspiration()

  function run() {
    if (!eventId) return
    adopt.mutate(
      { slug: inspiration.slug, eventId, mode },
      {
        onSuccess: ({ unpricedItems }) => {
          toast.success(`${inspiration.name} is now your lead concept`, {
            description: [
              hasBudget ? (mode === 'replace' ? 'Your budget now uses its pieces.' : 'Its pieces were added to your budget.') : 'Your budget has started from it.',
              unpricedItems.length > 0 && `${unpricedItems.length} ${unpricedItems.length === 1 ? 'piece is' : 'pieces are'} priced on request.`,
            ]
              .filter(Boolean)
              .join(' '),
          })
          navigate(`/events/${eventId}?tab=moodboard`)
        },
        onError: (err) => toast.error('Could not adopt this concept', { description: err.message }),
      },
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {eventsFailed && events.length === 0 ? (
        <LoadError what="your events" onRetry={() => void refetchEvents()} className="py-2" />
      ) : (
        <Select
          value={eventId}
          onValueChange={(v) => {
            setPicked(v)
            // A new event starts from the safe choice; "replace" is always a deliberate pick.
            setMode('merge')
          }}
        >
          <SelectTrigger aria-label="Target event">
            <SelectValue placeholder="Select an event" />
          </SelectTrigger>
          <SelectContent>
            {events.length === 0 ? (
              <SelectItem value="_none" disabled>
                No events yet
              </SelectItem>
            ) : (
              events.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {(e.concept ?? e.name) + ' · ' + e.type}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      )}

      {hasBudget && (
        <div role="radiogroup" aria-label="Budget" className="grid grid-cols-2 gap-2">
          {(
            [
              ['merge', 'Add to my budget', 'Keep what you have'],
              ['replace', 'Replace my budget', 'Use only this concept'],
            ] as const
          ).map(([value, title, hint]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              onClick={() => setMode(value)}
              className={cn(
                'rounded-2xl border p-3 text-left transition',
                mode === value ? 'border-accent bg-accent/10' : 'border-border/15 hover:border-border/30',
              )}
            >
              <span className="text-text block text-xs font-semibold">{title}</span>
              <span className="text-muted block text-[11px]">{hint}</span>
            </button>
          ))}
        </div>
      )}

      <Button size={size} disabled={!eventId || adopt.isPending} onClick={run}>
        <Sparkles className="h-4 w-4" />
        Adopt {inspiration.name}
        {event ? ` into ${event.type}` : ''}
      </Button>
    </div>
  )
}
