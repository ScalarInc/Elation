import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Copy, Heart, Sparkles, Trash2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/format'
import { api } from '@/api'
import { useResolvedEvents } from '@/hooks/useResolvedEvent'
import type { Moodboard } from '@/types'

export function MoodboardsPage() {
  const [boards, setBoards] = useState<Moodboard[]>([])
  const [eventFilter, setEventFilter] = useState<string>('all')
  const events = useResolvedEvents()

  useEffect(() => {
    let cancelled = false
    api.moodboards.list().then((rows) => {
      if (!cancelled) setBoards(rows)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(
    () => (eventFilter === 'all' ? boards : boards.filter((b) => b.eventId === eventFilter)),
    [boards, eventFilter],
  )

  const eventById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events])

  async function duplicate(board: Moodboard) {
    try {
      const copy = await api.moodboards.duplicate(board.id)
      setBoards((prev) => [copy, ...prev])
      toast.success('Concept duplicated')
    } catch (err) {
      toast.error("Couldn't duplicate", { description: (err as Error).message })
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this concept? This cannot be undone.')) return
    try {
      await api.moodboards.remove(id)
      setBoards((prev) => prev.filter((b) => b.id !== id))
      toast.success('Concept deleted')
    } catch (err) {
      toast.error("Couldn't delete", { description: (err as Error).message })
    }
  }

  async function toggleLike(id: string) {
    const board = boards.find((b) => b.id === id)
    if (!board) return
    try {
      const saved = await api.moodboards.update(id, { liked: !board.liked })
      setBoards((prev) => prev.map((b) => (b.id === id ? saved : b)))
    } catch (err) {
      toast.error("Couldn't update", { description: (err as Error).message })
    }
  }

  return (
    <div className="px-10 pb-12 pt-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-text text-3xl">Moodboards</h1>
          <p className="text-muted/70 mt-1 text-sm">
            Every concept Elation has drafted for your events — kept in one place.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-muted flex items-center gap-2 text-xs font-semibold uppercase tracking-widest">
            Event
            <select
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              className="border-border/15 bg-surface text-text focus:border-accent h-9 rounded-lg border px-3 text-xs outline-none"
            >
              <option value="all">All events</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.concept ?? e.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <span className="bg-accent/15 text-accent flex h-14 w-14 items-center justify-center rounded-2xl">
              <Sparkles className="h-6 w-6" />
            </span>
            <div className="max-w-md">
              <p className="font-display text-text text-xl">No moodboards yet</p>
              <p className="text-muted/70 mt-2 text-sm">
                Open an event and let Elation curate a concept from your questionnaire answers.
              </p>
            </div>
            <Button asChild>
              <Link to="/events">Go to My Events</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((b) => {
            const ev = eventById.get(b.eventId)
            return (
              <Card key={b.id} className="group flex flex-col overflow-hidden">
                <div className="relative h-52 overflow-hidden">
                  <div className="grid h-full grid-cols-2 gap-1">
                    <img
                      src={b.tiles[0]}
                      alt=""
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    />
                    <div className="grid grid-rows-2 gap-1">
                      <img src={b.tiles[1] ?? b.tiles[0]} className="h-full w-full object-cover" alt="" />
                      <img src={b.tiles[2] ?? b.tiles[0]} className="h-full w-full object-cover" alt="" />
                    </div>
                  </div>
                  <div className="absolute inset-x-3 top-3 flex items-center justify-between">
                    {ev && (
                      <Badge variant="accent" className="bg-white/90 text-ink">
                        {ev.type}
                      </Badge>
                    )}
                    <button
                      onClick={() => toggleLike(b.id)}
                      aria-label={b.liked ? 'Unfavourite' : 'Favourite'}
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-full shadow transition',
                        b.liked ? 'bg-accent text-accent-fg' : 'bg-white/90 text-ink',
                      )}
                    >
                      <Heart className={cn('h-3.5 w-3.5', b.liked && 'fill-current')} />
                    </button>
                  </div>
                </div>

                <div className="flex flex-1 flex-col gap-4 p-5">
                  <div>
                    <p className="font-display text-text text-lg leading-tight">{b.title}</p>
                    {ev && (
                      <p className="text-muted/70 mt-0.5 text-xs">
                        {ev.concept ?? ev.name} · {formatDate(b.createdAt || ev.date)}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {b.palette.slice(0, 6).map((hex) => (
                      <span
                        key={hex}
                        className="ring-border/10 h-5 w-5 rounded-full ring-2"
                        style={{ background: hex }}
                        title={hex}
                      />
                    ))}
                  </div>

                  <div className="mt-auto flex items-center justify-between border-t border-border/10 pt-3">
                    <Button asChild variant="ghost" size="sm">
                      <Link to={`/events/${b.eventId}?tab=moodboard`}>
                        Open
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => duplicate(b)} aria-label="Duplicate">
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => remove(b.id)}
                        aria-label="Delete"
                        className="text-muted hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
