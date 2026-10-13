import type * as React from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CalendarDays, Image as ImageIcon, Package, Search, Sparkles } from 'lucide-react'
import { LoadError } from '@/components/ui/load-error'
import { Skeleton } from '@/components/ui/skeleton'
import { useEvents } from '@/data/events'
import { useInspirations } from '@/data/inspirations'
import { useInventory } from '@/data/inventory'
import { useMoodboardLibrary } from '@/data/moodboards'
import { formatDate } from '@/lib/format'

/** One search box for the client's studio: events, concepts, the gallery and Elation's pieces. */

const matches = (q: string, ...fields: (string | null | undefined)[]) => fields.some((f) => f?.toLowerCase().includes(q))

function Group({ title, icon, children, count, loading, error, onRetry }: { title: string; icon: React.ReactNode; children: React.ReactNode; count: number; loading: boolean; error?: boolean; onRetry?: () => void }) {
  return (
    <section>
      <h2 className="text-muted/70 mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
        {icon} {title} {!loading && `· ${count}`}
      </h2>
      {error ? <LoadError what={title.toLowerCase()} onRetry={onRetry ?? (() => {})} className="py-4" /> : loading ? <Skeleton className="h-16 w-full rounded-2xl" /> : count === 0 ? <p className="text-muted/70 text-sm">No matches.</p> : <ul className="space-y-1">{children}</ul>}
    </section>
  )
}

const row = 'hover:bg-surface-2 flex items-center gap-3 rounded-2xl px-3 py-2.5 transition'

export function SearchPage() {
  const [params] = useSearchParams()
  const q = (params.get('q') ?? '').trim().toLowerCase()
  const events = useEvents()
  const boards = useMoodboardLibrary()
  const gallery = useInspirations()
  const pieces = useInventory()

  const ev = q ? (events.data ?? []).filter((e) => matches(q, e.name, e.concept, e.type, e.venue.name, e.venue.city)) : []
  const mb = q ? (boards.data ?? []).filter((b) => matches(q, b.title, b.tag)) : []
  const insp = q ? (gallery.data ?? []).filter((i) => matches(q, i.name, i.style, i.summary, ...i.eventTypes)) : []
  const inv = q ? (pieces.data ?? []).filter((i) => matches(q, i.name, i.category, i.colour)).slice(0, 20) : []

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-6 md:px-10 md:py-10">
      <header>
        <h1 className="font-display text-text text-3xl">Search</h1>
        <p className="text-muted mt-1 text-sm" aria-live="polite">{q ? `Results for “${params.get('q')}”` : 'Type in the search box above.'}</p>
      </header>
      {!q ? (
        <div className="text-muted/70 flex flex-col items-center gap-3 py-16 text-sm">
          <Search className="h-6 w-6" /> Search your events, saved concepts, the inspiration gallery and Elation’s pieces.
        </div>
      ) : (
        <>
          <Group title="Events" icon={<CalendarDays className="h-3.5 w-3.5" />} count={ev.length} loading={events.isPending} error={events.isError && !events.data} onRetry={() => void events.refetch()}>
            {ev.map((e) => (
              <li key={e.id}>
                <Link to={`/events/${e.id}`} className={row}>
                  <span className="text-text font-semibold">{e.concept ?? e.name}</span>
                  <span className="text-muted text-xs">
                    {e.type} · {formatDate(e.date)} · {e.venue.name}
                  </span>
                </Link>
              </li>
            ))}
          </Group>
          <Group title="Your concepts" icon={<ImageIcon className="h-3.5 w-3.5" />} count={mb.length} loading={boards.isPending} error={boards.isError && !boards.data} onRetry={() => void boards.refetch()}>
            {mb.map((b) => (
              <li key={b.id}>
                <Link to={`/events/${b.eventId}?tab=moodboard`} className={row}>
                  {b.cover && <img src={b.cover} alt="" className="h-10 w-10 rounded-lg object-cover" />}
                  <span className="text-text font-semibold">{b.title}</span>
                  <span className="text-muted text-xs">{b.tag}</span>
                </Link>
              </li>
            ))}
          </Group>
          <Group title="Inspiration gallery" icon={<Sparkles className="h-3.5 w-3.5" />} count={insp.length} loading={gallery.isPending} error={gallery.isError && !gallery.data} onRetry={() => void gallery.refetch()}>
            {insp.map((i) => (
              <li key={i.id}>
                <Link to={`/inspirations/${i.slug}`} className={row}>
                  <img src={i.cover} alt="" className="h-10 w-10 rounded-lg object-cover" />
                  <span className="text-text font-semibold">{i.name}</span>
                  <span className="text-muted text-xs">{i.style}</span>
                </Link>
              </li>
            ))}
          </Group>
          <Group title="Elation pieces" icon={<Package className="h-3.5 w-3.5" />} count={inv.length} loading={pieces.isPending} error={pieces.isError && !pieces.data} onRetry={() => void pieces.refetch()}>
            {inv.map((i) => (
              <li key={i.id} className={row}>
                {i.image && <img src={i.image} alt="" className="h-10 w-10 rounded-lg object-cover" />}
                <span className="text-text font-semibold">{i.name}</span>
                <span className="text-muted text-xs">
                  {i.category} · {i.colour}
                </span>
              </li>
            ))}
          </Group>
        </>
      )}
    </div>
  )
}
