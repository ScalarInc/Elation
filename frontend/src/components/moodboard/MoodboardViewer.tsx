import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Heart, Save, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatPKR } from '@/lib/format'
import { api } from '@/api'
import type { InventoryItem, Moodboard } from '@/types'
import { deriveMoodboardDefaults } from '@/lib/questionnaire/derived'
import { EMPTY_ANSWERS, useQuestionnaire } from '@/stores/questionnaireStore'

const MOOD_OPTIONS = ['Romantic', 'Regal', 'Dramatic', 'Serene', 'Whimsical', 'Bohemian']
const STYLE_OPTIONS = ['Modern Luxury', 'Traditional', 'Garden', 'Editorial', 'Architectural']
const DENSITY = ['Minimal', 'Moderate', 'Heavy', 'Extremely Floral']
const VENUE_OPTIONS = ['Hilltop Outdoor', 'Ballroom', 'Garden', 'Terrace']

/** Each saved moodboard for the event is shown as a lettered concept (A, B, C…). */
type Concept = { id: string; letter: string; board: Moodboard }

type Props = { eventId: string }

export function MoodboardViewer({ eventId }: Props) {
  const [boards, setBoards] = useState<Moodboard[] | null>(null)
  const answers = useQuestionnaire(
    (s) => s.byEvent[eventId]?.answers ?? EMPTY_ANSWERS,
  )
  const derived = useMemo(() => deriveMoodboardDefaults(answers), [answers])

  useEffect(() => {
    let cancelled = false
    api.moodboards.byEvent(eventId).then((rows) => {
      if (!cancelled) setBoards(rows)
    })
    return () => {
      cancelled = true
    }
  }, [eventId])

  const variants = useMemo<Concept[]>(
    () =>
      (boards ?? []).map((board, i) => ({
        id: board.id,
        letter: String.fromCharCode(65 + i),
        board,
      })),
    [boards],
  )
  const [conceptId, setConceptId] = useState<string | null>(null)
  const active = variants.find((v) => v.id === conceptId) ?? variants[0]

  const [mood, setMood] = useState(() => derived.mood ?? 'Romantic')
  const [style, setStyle] = useState(() => derived.style ?? 'Modern Luxury')
  const [density, setDensity] = useState(() => derived.density ?? 'Heavy')
  const [venueLocked, setVenueLocked] = useState(true)
  const [venue, setVenue] = useState(() => derived.venue ?? 'Hilltop Outdoor')

  // Palette shown in controls: prefer client's answered palette, else concept's
  const controlPalette =
    derived.palette && derived.palette.length > 0
      ? derived.palette
      : active?.board.palette ?? []

  const [regenerating, setRegenerating] = useState(false)
  // Opened from a tile once moodboard tiles reference inventory items.
  const [drawerItem, setDrawerItem] = useState<InventoryItem | null>(null)
  const [likedById, setLikedById] = useState<Record<string, boolean>>({})
  const liked = active ? (likedById[active.id] ?? active.board.liked) : false

  if (boards === null) {
    return <Skeleton className="mt-4 h-96 w-full" />
  }

  if (!active) {
    return (
      <Card className="mt-4">
        <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
          <p className="font-display text-text text-xl">No moodboard yet.</p>
          <p className="text-muted max-w-md text-sm">
            Complete the questionnaire and Elation will draft a concept for you.
          </p>
        </CardContent>
      </Card>
    )
  }

  async function regenerate() {
    setRegenerating(true)
    try {
      // TODO(backend): request a new moodboard from the mood, style, density and
      // venue controls, then reload `boards`.
    } finally {
      setRegenerating(false)
    }
  }

  function saveConcept() {
    // TODO(backend): save the active concept to the client's moodboard library.
  }

  function addToBudget(_item: InventoryItem) {
    // TODO(backend): add the item as a line on this event's budget.
  }

  function requestSwap(_item: InventoryItem) {
    // TODO(backend): ask Elation for alternatives to this item.
  }

  function toggleLiked() {
    if (!active) return
    setLikedById((prev) => ({ ...prev, [active.id]: !liked }))
  }

  return (
    <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
      {/* Left controls */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <Card>
          <CardContent className="space-y-5 p-6">
            <header>
              <div className="flex items-center gap-2">
                <Sparkles className="text-accent h-4 w-4" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted/70">
                  Curation controls
                </p>
              </div>
              <p className="font-display text-text mt-1 text-xl">Direct Elation</p>
            </header>

            <ControlGroup label="Mood">
              <ChipPicker options={MOOD_OPTIONS} value={mood} onChange={setMood} />
            </ControlGroup>

            <ControlGroup label="Style">
              <ChipPicker options={STYLE_OPTIONS} value={style} onChange={setStyle} />
            </ControlGroup>

            <ControlGroup label="Palette">
              <div className="flex flex-wrap gap-2">
                {controlPalette.map((hex) => (
                  <span
                    key={hex}
                    className="ring-border/10 h-7 w-7 rounded-full ring-2"
                    style={{ background: hex }}
                    title={hex}
                  />
                ))}
              </div>
            </ControlGroup>

            <ControlGroup label="Floral density">
              <ChipPicker options={DENSITY} value={density} onChange={setDensity} />
            </ControlGroup>

            <ControlGroup label="Venue">
              <select
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                className="border-border/15 bg-surface text-text focus:border-accent flex h-10 w-full rounded-xl border px-3 text-sm outline-none"
              >
                {VENUE_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <label className="text-muted mt-2 flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={venueLocked}
                  onChange={(e) => setVenueLocked(e.target.checked)}
                  className="accent-accent h-3.5 w-3.5"
                />
                Keep venue locked while regenerating
              </label>
            </ControlGroup>

            <div className="space-y-2 pt-1">
              <Button
                className="w-full"
                onClick={regenerate}
                disabled={regenerating}
              >
                {regenerating ? (
                  <>
                    <span className="border-accent-fg/50 h-3.5 w-3.5 animate-spin rounded-full border-2 border-t-transparent" />
                    Curating…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Regenerate
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={saveConcept}
              >
                <Save className="h-4 w-4" />
                Save as concept
              </Button>
            </div>
          </CardContent>
        </Card>
      </aside>

      {/* Right canvas */}
      <section className="min-w-0 space-y-5">
        {/* Provenance chip */}
        {derived.fromQuestionnaire && (
          <div className="border-accent/30 bg-accent/10 flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs">
            <Sparkles className="text-accent h-3.5 w-3.5" />
            <span className="text-text font-semibold">Curated from your answers.</span>
            <span className="text-muted">
              Tweak any control on the left to explore a different direction.
            </span>
          </div>
        )}

        {/* Concept variants */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            {variants.map((v) => {
              const active = v.id === conceptId
              return (
                <button
                  key={v.id}
                  onClick={() => setConceptId(v.id)}
                  className={cn(
                    'group border-border/15 flex items-center gap-2 rounded-2xl border p-1.5 pr-3 text-left transition',
                    active
                      ? 'border-accent bg-accent/10'
                      : 'bg-surface hover:border-border/30',
                  )}
                >
                  <span
                    className={cn(
                      'font-display flex h-9 w-9 items-center justify-center rounded-xl text-sm font-semibold',
                      active
                        ? 'bg-accent text-accent-fg'
                        : 'bg-surface-2 text-muted',
                    )}
                  >
                    {v.letter}
                  </span>
                  <span className={cn('text-xs font-semibold', active ? 'text-text' : 'text-muted')}>
                    {v.board.title}
                  </span>
                </button>
              )
            })}
          </div>

          <button
            type="button"
            onClick={toggleLiked}
            className={cn(
              'border-border/15 flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition',
              liked ? 'bg-accent/15 text-accent border-accent/30' : 'bg-surface text-muted hover:text-text',
            )}
          >
            <Heart className={cn('h-3.5 w-3.5', liked && 'fill-accent')} />
            {liked ? 'Loved' : 'Love this'}
          </button>
        </div>

        {/* Masonry canvas */}
        <div className="relative">
          <AnimatePresence mode="wait">
            {regenerating ? (
              <motion.div
                key="skeleton"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid grid-cols-2 gap-4 md:grid-cols-3"
              >
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className={cn('h-56', i % 2 && 'h-72')} />
                ))}
              </motion.div>
            ) : (
              <motion.div
                key={active.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.4 }}
                className="columns-1 gap-4 sm:columns-2 lg:columns-3"
              >
                {active.board.tiles.map((src, i) => (
                  <div
                    key={`${active.id}-${i}`}
                    className="group relative mb-4 block w-full overflow-hidden rounded-2xl"
                  >
                    <img
                      src={src}
                      alt=""
                      className="w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                      style={{ height: i % 3 === 0 ? 320 : i % 3 === 1 ? 240 : 280 }}
                    />
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* Item drawer */}
      <AnimatePresence>
        {drawerItem && (
          <>
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
              onClick={() => setDrawerItem(null)}
            />
            <motion.aside
              key="drawer"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.3 }}
              className="border-border/10 bg-surface fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l shadow-soft"
            >
              <div className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted/70">
                      {drawerItem.category}
                    </p>
                    <h3 className="font-display text-text mt-1 text-2xl">{drawerItem.name}</h3>
                  </div>
                  <button
                    onClick={() => setDrawerItem(null)}
                    aria-label="Close"
                    className="hover:bg-surface-2 rounded-lg p-2 transition"
                  >
                    <X className="text-muted h-4 w-4" />
                  </button>
                </div>

                <img
                  src={drawerItem.imageUrl ?? undefined}
                  alt={drawerItem.name}
                  className="mt-5 h-56 w-full rounded-2xl object-cover"
                />

                <dl className="mt-5 space-y-2 text-sm">
                  {drawerItem.colour && <Row label="Colour" value={drawerItem.colour} />}
                  {drawerItem.material && <Row label="Material" value={drawerItem.material} />}
                  <Row label="Unit" value={drawerItem.unit} />
                  <Row
                    label="Price"
                    value={`${formatPKR(drawerItem.pricePkr)} / ${drawerItem.unit}`}
                  />
                  <Row label="Tags" value={drawerItem.tags.join(', ')} />
                </dl>

                <div className="mt-6 flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => addToBudget(drawerItem)}
                  >
                    Add to budget
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => requestSwap(drawerItem)}
                  >
                    Ask for swap
                  </Button>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

function ControlGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted/70">{label}</p>
      {children}
    </div>
  )
}

function ChipPicker({
  options,
  value,
  onChange,
}: {
  options: string[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const isOn = o === value
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
              isOn
                ? 'bg-accent text-accent-fg border-accent'
                : 'border-border/20 bg-surface text-muted hover:border-border/40 hover:text-text',
            )}
          >
            {o}
          </button>
        )
      })}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-text text-right font-semibold">{value}</dd>
    </div>
  )
}
