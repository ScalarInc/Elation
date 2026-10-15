import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { api } from '@/api'
import { formatPKRCompact } from '@/lib/format'
import type { ClientEvent, Inspiration, RecommendedInspiration } from '@/types'

/** "Recommended for <event>": concepts ranked by Elation for one of the client's events. */
export function RecommendedForEvent({
  events,
  onOpen,
}: {
  events: ClientEvent[]
  onOpen: (inspiration: Inspiration) => void
}) {
  const [eventId, setEventId] = useState<string>('')
  const [results, setResults] = useState<{ eventId: string; items: RecommendedInspiration[] } | null>(null)
  const activeId = eventId || events[0]?.id || ''

  useEffect(() => {
    if (!activeId) return
    let cancelled = false
    api.inspirations.recommendedFor(activeId).then(
      (items) => !cancelled && setResults({ eventId: activeId, items }),
      () => !cancelled && setResults({ eventId: activeId, items: [] }),
    )
    return () => {
      cancelled = true
    }
  }, [activeId])

  if (!activeId) return null
  const loading = results?.eventId !== activeId
  if (!loading && results.items.length === 0) return null

  return (
    <div className="border-border/10 bg-surface mt-8 rounded-3xl border p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-text flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="text-accent h-4 w-4" />
          Elation recommends for
        </p>
        <select
          value={activeId}
          onChange={(e) => setEventId(e.target.value)}
          aria-label="Event to recommend for"
          className="border-border/15 bg-surface text-text h-9 rounded-xl border px-3 text-xs outline-none"
        >
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {(e.concept ?? e.name) + ' · ' + e.type}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-shimmer rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {results.items.map(({ inspiration, reason, estimatedCostPkr }) => (
            <button
              key={inspiration.id}
              type="button"
              onClick={() => onOpen(inspiration)}
              className="border-border/10 hover:border-accent/40 flex gap-3 rounded-2xl border p-3 text-left transition"
            >
              <img src={inspiration.cover} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover" />
              <div className="min-w-0">
                <p className="text-text truncate text-sm font-semibold">{inspiration.name}</p>
                <p className="text-muted mt-0.5 line-clamp-2 text-xs">{reason}</p>
                {estimatedCostPkr > 0 && (
                  <p className="text-muted/70 mt-1 text-[10px] font-semibold uppercase tracking-widest">
                    From about {formatPKRCompact(estimatedCostPkr)}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
