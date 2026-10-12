import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  Grid3x3,
  Heart,
  LayoutGrid,
  Sparkles,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Spinner } from '@/components/ui/spinner'
import {
  Dialog,
  DialogContent,
  DialogClose,
} from '@/components/ui/dialog'
import type { EventType } from '@elation/shared/domain'
import type { InspirationDto as Inspiration } from '@elation/shared/api'
import { AdoptInspiration } from '@/components/AdoptInspiration'
import { cn } from '@/lib/utils'
import { useInspiration, useInspirations } from '@/data/inspirations'

const EVENT_TYPE_CHIPS: (EventType | 'All')[] = [
  'All',
  'Mehndi',
  'Baraat',
  'Walima',
  'Nikkah',
  'Engagement',
]

const BUDGET_TIERS = ['Any', 'Intimate', 'Signature', 'Grand'] as const
type BudgetTier = (typeof BUDGET_TIERS)[number]

type ViewMode = 'masonry' | 'grid'

// Deterministic hash → tile height for masonry.
function heightFromId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  const heights = [280, 320, 360, 400, 440]
  return heights[h % heights.length]
}

// Split "Romantic · Modern Luxury" into ["Romantic", "Modern Luxury"].
function splitStyles(style: string): string[] {
  return style
    .split('·')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function InspirationsPage() {
  const { data, isPending: loading } = useInspirations()
  const items = data ?? null

  const [selectedType, setSelectedType] = useState<EventType | 'All'>('All')
  const [selectedStyles, setSelectedStyles] = useState<string[]>([])
  const [budgetTier, setBudgetTier] = useState<BudgetTier>('Any')
  const [selectedPalette, setSelectedPalette] = useState<string | null>(null)
  const [likes, setLikes] = useState<Record<string, boolean>>({})
  const [openInspiration, setOpenInspiration] = useState<Inspiration | null>(
    null,
  )

  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'masonry'
    const v = window.localStorage.getItem('insp:view')
    return v === 'grid' ? 'grid' : 'masonry'
  })

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('insp:view', view)
    }
  }, [view])

  const featured = useMemo(
    () => items?.find((i) => i.featured) ?? items?.[0],
    [items],
  )

  const allStyles = useMemo(() => {
    if (!items) return []
    const set = new Set<string>()
    for (const i of items) for (const s of splitStyles(i.style)) set.add(s)
    return Array.from(set)
  }, [items])

  const allPaletteHexes = useMemo(() => {
    if (!items) return []
    const set = new Set<string>()
    for (const i of items) for (const hex of i.palette) set.add(hex)
    return Array.from(set)
  }, [items])

  const filtered = useMemo(() => {
    if (!items) return []
    return items.filter((insp) => {
      if (
        selectedType !== 'All' &&
        !insp.eventTypes.includes(selectedType as EventType)
      ) {
        return false
      }
      if (selectedStyles.length > 0) {
        const styles = splitStyles(insp.style)
        const anyMatch = selectedStyles.some((s) => styles.includes(s))
        if (!anyMatch) return false
      }
      if (budgetTier !== 'Any' && insp.budgetTier !== budgetTier) {
        return false
      }
      if (selectedPalette && !insp.palette.includes(selectedPalette)) {
        return false
      }
      return true
    })
  }, [items, selectedType, selectedStyles, budgetTier, selectedPalette])

  function toggleLike(id: string) {
    setLikes((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function toggleStyle(s: string) {
    setSelectedStyles((prev) =>
      prev.includes(s) ? prev.filter((v) => v !== s) : [...prev, s],
    )
  }

  function clearFilters() {
    setSelectedType('All')
    setSelectedStyles([])
    setBudgetTier('Any')
    setSelectedPalette(null)
  }

  return (
    <div className="pb-16">
      {/* Hero */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="px-10 pt-10"
      >
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.1fr_1fr]">
          <div className="flex flex-col justify-center">
            <p className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">
              Inspiration Library
            </p>
            <h1 className="font-display text-text mt-3 text-4xl leading-tight md:text-5xl">
              Browse concepts you can adopt into your event.
            </h1>
            <p className="text-muted mt-4 max-w-xl text-sm leading-relaxed">
              Every concept is grounded in Elation's inventory — pick one and
              we'll carry it into your moodboard and budget.
            </p>
          </div>

          {featured && (
            <FeaturedBanner
              inspiration={featured}
              onOpen={() => setOpenInspiration(featured)}
            />
          )}
        </div>
      </motion.section>

      {/* Filter bar */}
      <div className="bg-bg/80 sticky top-16 z-20 mt-10 border-y border-border/10 px-10 py-4 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {/* Event type chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            {EVENT_TYPE_CHIPS.map((t) => {
              const active = selectedType === t
              return (
                <motion.button
                  key={t}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setSelectedType(t)}
                  className={cn(
                    'rounded-full px-3.5 py-1.5 text-[11px] font-semibold tracking-wide transition',
                    active
                      ? 'bg-accent text-accent-fg shadow-sm'
                      : 'bg-surface text-muted border-border/10 hover:text-text border',
                  )}
                >
                  {t}
                </motion.button>
              )
            })}
          </div>

          {/* Style chips */}
          {allStyles.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {allStyles.map((s) => {
                const active = selectedStyles.includes(s)
                return (
                  <motion.button
                    key={s}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => toggleStyle(s)}
                    className={cn(
                      'rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest transition',
                      active
                        ? 'bg-accent text-accent-fg shadow-sm'
                        : 'bg-surface-2 text-muted hover:text-text border border-border/10',
                    )}
                  >
                    {s}
                  </motion.button>
                )
              })}
            </div>
          )}

          {/* Budget tier segmented */}
          <div className="border-border/10 bg-surface flex items-center gap-0.5 rounded-full border p-0.5">
            {BUDGET_TIERS.map((t) => {
              const active = budgetTier === t
              return (
                <button
                  key={t}
                  onClick={() => setBudgetTier(t)}
                  className={cn(
                    'rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest transition',
                    active
                      ? 'bg-accent text-accent-fg'
                      : 'text-muted hover:text-text',
                  )}
                >
                  {t}
                </button>
              )
            })}
          </div>

          {/* Palette swatches */}
          {allPaletteHexes.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">
                Palette
              </span>
              {allPaletteHexes.slice(0, 10).map((hex) => {
                const active = selectedPalette === hex
                return (
                  <button
                    key={hex}
                    onClick={() =>
                      setSelectedPalette((prev) => (prev === hex ? null : hex))
                    }
                    aria-label={`Filter by ${hex}`}
                    className={cn(
                      'h-5 w-5 rounded-full ring-2 transition',
                      active
                        ? 'ring-accent scale-110'
                        : 'ring-border/20 hover:scale-110',
                    )}
                    style={{ background: hex }}
                  />
                )
              })}
              {selectedPalette && (
                <button
                  onClick={() => setSelectedPalette(null)}
                  className="text-muted hover:text-text ml-1"
                  aria-label="Clear palette filter"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          {/* View toggle — right side */}
          <div className="border-border/10 bg-surface ml-auto flex items-center gap-0.5 rounded-full border p-0.5">
            <button
              onClick={() => setView('masonry')}
              aria-label="Masonry view"
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full transition',
                view === 'masonry'
                  ? 'bg-accent text-accent-fg'
                  : 'text-muted hover:text-text',
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setView('grid')}
              aria-label="Grid view"
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full transition',
                view === 'grid'
                  ? 'bg-accent text-accent-fg'
                  : 'text-muted hover:text-text',
              )}
            >
              <Grid3x3 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="px-10 pt-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner size="lg" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="h-6 w-6" />}
            title="Nothing matches those filters yet."
            description="Try loosening a filter or clear them all to see the full library."
            action={
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : view === 'masonry' ? (
          <div className="columns-2 gap-4 md:columns-3 lg:columns-4 [&>*]:mb-4">
            {filtered.map((insp, idx) => (
              <InspirationCard
                key={insp.id}
                inspiration={insp}
                index={idx}
                liked={!!likes[insp.id]}
                onToggleLike={() => toggleLike(insp.id)}
                onOpen={() => setOpenInspiration(insp)}
                height={heightFromId(insp.id)}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((insp, idx) => (
              <InspirationCard
                key={insp.id}
                inspiration={insp}
                index={idx}
                liked={!!likes[insp.id]}
                onToggleLike={() => toggleLike(insp.id)}
                onOpen={() => setOpenInspiration(insp)}
                height={320}
                gridMode
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail modal */}
      <InspirationDetailDialog
        inspiration={openInspiration}
        onOpenChange={(open) => !open && setOpenInspiration(null)}
      />
    </div>
  )
}

// ---------- Featured banner ----------

function FeaturedBanner({
  inspiration,
  onOpen,
}: {
  inspiration: Inspiration
  onOpen: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 0.1, ease: 'easeOut' }}
      className="border-border/10 bg-surface shadow-lift group relative overflow-hidden rounded-3xl border"
    >
      <div className="relative h-72 overflow-hidden md:h-80">
        <img
          src={inspiration.cover}
          alt={inspiration.name}
          className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
        <div className="absolute left-5 top-5">
          <Badge variant="accent" className="bg-white/90 text-ink">
            Featured Concept
          </Badge>
        </div>
        <div className="absolute inset-x-5 bottom-5 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-90">
            {inspiration.style}
          </p>
          <p className="font-display mt-1 text-3xl leading-tight drop-shadow">
            {inspiration.name}
          </p>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              {inspiration.palette.map((hex) => (
                <span
                  key={hex}
                  className="ring-white/50 h-5 w-5 rounded-full ring-2"
                  style={{ background: hex }}
                  title={hex}
                />
              ))}
            </div>
            <Button
              size="sm"
              onClick={onOpen}
              className="bg-white text-ink hover:bg-white/90"
            >
              View concept
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ---------- Card ----------

function InspirationCard({
  inspiration,
  index,
  liked,
  onToggleLike,
  onOpen,
  height,
  gridMode,
}: {
  inspiration: Inspiration
  index: number
  liked: boolean
  onToggleLike: () => void
  onOpen: () => void
  height: number
  gridMode?: boolean
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: Math.min(index * 0.04, 0.4) }}
      className={cn(
        'group relative overflow-hidden rounded-3xl bg-surface shadow-card border border-border/10',
        !gridMode && 'break-inside-avoid',
      )}
    >
      <button
        onClick={onOpen}
        className="block w-full text-left"
        style={{ height: `${height}px` }}
        aria-label={`Open ${inspiration.name}`}
      >
        <img
          src={inspiration.cover}
          alt={inspiration.name}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
      </button>

      {/* Top-left badge */}
      {inspiration.budgetTier && (
        <div className="pointer-events-none absolute left-3 top-3">
          <Badge variant="accent" className="bg-white/90 text-ink">
            {inspiration.budgetTier}
          </Badge>
        </div>
      )}

      {/* Like heart */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onToggleLike()
        }}
        aria-label={liked ? 'Unfavourite' : 'Favourite'}
        className={cn(
          'absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full shadow-sm transition',
          liked ? 'bg-accent text-accent-fg' : 'bg-white/90 text-ink hover:bg-white',
        )}
      >
        <Heart className={cn('h-3.5 w-3.5', liked && 'fill-current')} />
      </button>

      {/* Hover overlay */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/25 to-transparent p-4 opacity-0 transition duration-300 group-hover:opacity-100">
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/85">
          {inspiration.style}
        </p>
        <p className="font-display mt-0.5 text-xl leading-tight text-white drop-shadow">
          {inspiration.name}
        </p>
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-1">
            {inspiration.palette.map((hex) => (
              <span
                key={hex}
                className="ring-white/50 h-4 w-4 rounded-full ring-2"
                style={{ background: hex }}
              />
            ))}
          </div>
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              onOpen()
            }}
            className="pointer-events-auto bg-white text-ink hover:bg-white/90"
          >
            View
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </motion.div>
  )
}

// ---------- Detail dialog ----------

function InspirationDetailDialog({
  inspiration,
  onOpenChange,
}: {
  inspiration: Inspiration | null
  onOpenChange: (open: boolean) => void
}) {
  // The pieces Elation would pull in come with the concept's detail.
  const { data: detail } = useInspiration(inspiration?.slug)
  const recommendedInventory = (detail?.items ?? []).slice(0, 4).map((i) => i.item)

  return (
    <Dialog open={!!inspiration} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {inspiration && (
          <DialogContent className="max-w-5xl overflow-hidden p-0">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="grid max-h-[85vh] grid-cols-1 overflow-y-auto md:grid-cols-2"
            >
              {/* Left: cover + tiles */}
              <div className="bg-surface-2 relative flex flex-col gap-2 p-3">
                <div className="relative h-72 overflow-hidden rounded-2xl md:h-96">
                  <img
                    src={inspiration.cover}
                    alt={inspiration.name}
                    className="h-full w-full object-cover"
                  />
                  {inspiration.budgetTier && (
                    <div className="absolute left-3 top-3">
                      <Badge variant="accent" className="bg-white/90 text-ink">
                        {inspiration.budgetTier}
                      </Badge>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {inspiration.tiles.slice(0, 4).map((t, i) => (
                    <div
                      key={i}
                      className="h-28 overflow-hidden rounded-xl md:h-32"
                    >
                      <img
                        src={t}
                        alt=""
                        className="h-full w-full object-cover transition duration-500 hover:scale-105"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: content */}
              <div className="flex flex-col gap-5 p-6 md:p-8">
                <div>
                  <p className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">
                    Concept
                  </p>
                  <h2 className="font-display text-text mt-2 text-4xl leading-tight">
                    {inspiration.name}
                  </h2>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
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

                <div>
                  <p className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">
                    Palette
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {inspiration.palette.map((hex) => (
                      <div
                        key={hex}
                        className="border-border/10 flex items-center gap-2 rounded-full border px-2 py-1"
                      >
                        <span
                          className="ring-border/10 h-4 w-4 rounded-full ring-2"
                          style={{ background: hex }}
                        />
                        <span className="text-muted text-[10px] font-semibold uppercase tracking-widest">
                          {hex}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="text-text/85 text-sm leading-relaxed">
                  {inspiration.summary}
                </p>

                {recommendedInventory.length > 0 && (
                  <div>
                    <p className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">
                      Inventory we'd pull in
                    </p>
                    <div className="mt-2 grid grid-cols-4 gap-2">
                      {recommendedInventory.map((it) => (
                        <div
                          key={it.id}
                          className="border-border/10 bg-surface overflow-hidden rounded-xl border"
                          title={it.name}
                        >
                          <div className="h-16 overflow-hidden">
                            {it.image && <img src={it.image} alt={it.name} className="h-full w-full object-cover" />}
                          </div>
                          <p className="text-text truncate px-2 py-1 text-[10px] font-semibold">
                            {it.name}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Adopt flow */}
                <div className="border-border/10 mt-auto rounded-2xl border bg-cream-panel p-4">
                  <p className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">
                    Adopt into event
                  </p>
                  <p className="text-muted mt-1 text-xs">
                    We'll carry this concept into your moodboard and prime the
                    budget with matching inventory.
                  </p>

                  <div className="mt-3 flex flex-col gap-3">
                    <AdoptInspiration inspiration={inspiration} />

                    <Link
                      to={`/inspirations/${inspiration.slug}`}
                      className="text-muted hover:text-text text-center text-xs font-semibold underline-offset-4 hover:underline"
                    >
                      Open full concept page
                    </Link>
                  </div>
                </div>
              </div>
            </motion.div>

            <DialogClose className="absolute right-3 top-3 z-10 rounded-full bg-white/85 p-1.5 text-ink shadow-sm hover:bg-white">
              <X className="h-4 w-4" />
            </DialogClose>
          </DialogContent>
        )}
      </AnimatePresence>
    </Dialog>
  )
}
