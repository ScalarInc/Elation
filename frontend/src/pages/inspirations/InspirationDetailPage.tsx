import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { api } from '@/api'
import { useResolvedEvents } from '@/hooks/useResolvedEvent'
import type { Inspiration, InventoryItem } from '@/types'

function splitStyles(style: string): string[] {
  return style
    .split('·')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function InspirationDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const events = useResolvedEvents()

  const [inspiration, setInspiration] = useState<Inspiration | null | undefined>(
    undefined,
  )
  const [targetEventId, setTargetEventId] = useState<string>('')

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    api.inspirations.get(slug).then((insp) => {
      if (!cancelled) setInspiration(insp ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [slug])

  useEffect(() => {
    if (!targetEventId && events[0]) setTargetEventId(events[0].id)
  }, [events, targetEventId])

  // TODO(backend): inventory recommended for this concept.
  const recommendedInventory: InventoryItem[] = []

  if (inspiration === undefined) {
    return (
      <div className="flex items-center justify-center px-10 py-24">
        <Spinner size="lg" />
      </div>
    )
  }

  if (inspiration === null) {
    return (
      <div className="px-10 py-12">
        <EmptyState
          icon={<Sparkles className="h-6 w-6" />}
          title="Concept not found"
          description="This inspiration may have been renamed or removed."
          action={
            <Button asChild>
              <Link to="/inspirations">Back to library</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const targetEvent = events.find((e) => e.id === targetEventId)

  function adopt() {
    if (!targetEventId || !inspiration) return
    // TODO(backend): adopt the concept into the target event's moodboard and budget,
    // then open /events/:id?tab=moodboard.
  }

  return (
    <div className="pb-16">
      {/* Back bar */}
      <div className="px-10 pt-8">
        <Button asChild variant="ghost" size="sm">
          <Link to="/inspirations">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to library
          </Link>
        </Button>
      </div>

      {/* Hero cover */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="px-10 pt-6"
      >
        <div className="relative overflow-hidden rounded-3xl border border-border/10 shadow-lift">
          <div className="relative h-[440px]">
            <img
              src={inspiration.cover}
              alt={inspiration.name}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
            <div className="absolute inset-x-8 bottom-8 text-white">
              {inspiration.budgetTier && (
                <Badge variant="accent" className="bg-white/90 text-ink">
                  {inspiration.budgetTier}
                </Badge>
              )}
              <p className="mt-3 text-[10px] font-bold uppercase tracking-widest opacity-90">
                {inspiration.style}
              </p>
              <h1 className="font-display mt-1 text-5xl leading-tight drop-shadow">
                {inspiration.name}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed opacity-90">
                {inspiration.summary}
              </p>
            </div>
          </div>
        </div>
      </motion.section>

      {/* Body grid */}
      <div className="grid grid-cols-1 gap-8 px-10 pt-10 lg:grid-cols-[1.4fr_1fr]">
        {/* Left: tiles + palette + inventory */}
        <div className="flex flex-col gap-8">
          <div>
            <p className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">
              Concept gallery
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {inspiration.tiles.map((t, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.05 }}
                  className="overflow-hidden rounded-2xl border border-border/10 shadow-card"
                >
                  <img
                    src={t}
                    alt=""
                    className="h-56 w-full object-cover transition duration-500 hover:scale-105 md:h-64"
                  />
                </motion.div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">
              Palette
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {inspiration.palette.map((hex) => (
                <div
                  key={hex}
                  className="border-border/10 flex items-center gap-2 rounded-full border px-3 py-1.5"
                >
                  <span
                    className="ring-border/10 h-5 w-5 rounded-full ring-2"
                    style={{ background: hex }}
                  />
                  <span className="text-muted text-[10px] font-semibold uppercase tracking-widest">
                    {hex}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">
              Style & event fit
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {splitStyles(inspiration.style).map((s) => (
                <Badge key={s} variant="default">
                  {s}
                </Badge>
              ))}
              {inspiration.eventTypes.map((t) => (
                <Badge key={t} variant="outline">
                  {t}
                </Badge>
              ))}
            </div>
          </div>

          {recommendedInventory.length > 0 && (
            <div>
              <p className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">
                Inventory we'd pull in
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {recommendedInventory.map((it) => (
                  <div
                    key={it.id}
                    className="border-border/10 bg-surface overflow-hidden rounded-2xl border shadow-card"
                  >
                    <div className="h-32 overflow-hidden">
                      <img
                        src={it.image}
                        alt={it.name}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="p-3">
                      <p className="text-text text-sm font-semibold leading-tight">
                        {it.name}
                      </p>
                      <p className="text-muted/70 mt-0.5 text-[10px] uppercase tracking-widest">
                        {it.category}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: adopt flow (sticky) */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardContent className="flex flex-col gap-4 p-6">
              <div>
                <p className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">
                  Adopt this concept
                </p>
                <p className="font-display text-text mt-2 text-2xl leading-tight">
                  Bring {inspiration.name} into your event.
                </p>
                <p className="text-muted mt-2 text-sm leading-relaxed">
                  Elation will seed your moodboard with these tiles, palette,
                  and inventory recommendations — you keep full control.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">
                  Target event
                </label>
                <Select value={targetEventId} onValueChange={setTargetEventId}>
                  <SelectTrigger>
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
              </div>

              <Button
                size="lg"
                disabled={!targetEventId}
                onClick={adopt}
                className="mt-1"
              >
                <Sparkles className="h-4 w-4" />
                Adopt {inspiration.name}
                {targetEvent ? ` into ${targetEvent.type}` : ''}
              </Button>

              <p className="text-muted/70 text-center text-[10px]">
                You can edit or swap concepts on the moodboard at any time.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
