import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Heart, ImageOff, Sparkles, Wallet, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatPKR } from '@/lib/format'
import { api } from '@/api'
import { ApiRequestError } from '@/api/client'
import { toast } from '@/components/ui/toast'
import type { InventoryItem, Moodboard, MoodboardItem } from '@/types'
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
  const navigate = useNavigate()
  const [boards, setBoards] = useState<Moodboard[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const answers = useQuestionnaire(
    (s) => s.byEvent[eventId]?.answers ?? EMPTY_ANSWERS,
  )
  const derived = useMemo(() => deriveMoodboardDefaults(answers), [answers])

  useEffect(() => {
    let cancelled = false
    api.moodboards.byEvent(eventId).then(
      (rows) => !cancelled && setBoards(rows),
      (err: Error) => !cancelled && setLoadError(err.message),
    )
    return () => {
      cancelled = true
    }
  }, [eventId])

  // Newest concept first from the API; letters follow creation order (A = oldest).
  const variants = useMemo<Concept[]>(
    () =>
      [...(boards ?? [])].reverse().map((board, i) => ({
        id: board.id,
        letter: String.fromCharCode(65 + (i % 26)),
        board,
      })),
    [boards],
  )
  const [conceptId, setConceptId] = useState<string | null>(null)
  const active = variants.find((v) => v.id === conceptId) ?? variants[variants.length - 1]

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
  const [usingInBudget, setUsingInBudget] = useState(false)
  const [selected, setSelected] = useState<MoodboardItem | null>(null)
  const drawerItem = selected?.item ?? null
  const liked = active?.board.liked ?? false

  function replaceBoard(board: Moodboard) {
    setBoards((prev) => (prev ?? []).map((b) => (b.id === board.id ? board : b)))
  }

  async function regenerate() {
    setRegenerating(true)
    try {
      const board = await api.moodboards.generate(eventId, {
        mood,
        style,
        density,
        venue: venueLocked ? venue : undefined,
      })
      setBoards((prev) => [board, ...(prev ?? [])])
      setConceptId(board.id)
      toast.success('Elation curated a new concept', {
        description: board.source === 'ai' ? board.title : `${board.title} · built from inventory rules`,
      })
    } catch (err) {
      toast.error("Couldn't create a concept", { description: (err as Error).message })
    } finally {
      setRegenerating(false)
    }
  }

  async function useInBudget() {
    if (!active) return
    setUsingInBudget(true)
    try {
      try {
        await api.budget.fromMoodboard(eventId, { moodboardId: active.id })
      } catch (err) {
        if (!(err instanceof ApiRequestError && err.code === 'BUDGET_NOT_EMPTY')) throw err
        if (!window.confirm('Your budget already has items. Replace them with this concept?')) return
        await api.budget.fromMoodboard(eventId, { moodboardId: active.id, replace: true })
      }
      toast.success('Budget drafted from this concept')
      navigate(`/events/${eventId}/budget`)
    } catch (err) {
      toast.error("Couldn't draft the budget", { description: (err as Error).message })
    } finally {
      setUsingInBudget(false)
    }
  }

  async function addToBudget(entry: MoodboardItem) {
    try {
      const snapshot = await api.budget.forEvent(eventId)
      const line = {
        id: crypto.randomUUID(),
        category: entry.budgetCategory ?? entry.item.category,
        itemId: entry.item.id,
        qty: entry.suggestedQty ?? 1,
        included: true,
      }
      await api.budget.save(eventId, snapshot.budgetPkr, [...snapshot.lines, line])
      toast.success('Added to budget', { description: `${entry.item.name} × ${line.qty}` })
      setSelected(null)
    } catch (err) {
      toast.error("Couldn't add to budget", { description: (err as Error).message })
    }
  }

  function requestSwap(_item: InventoryItem) {
    // Live consultant messaging arrives in step 9; for now this opens the Messages page.
    navigate('/messages')
  }

  async function toggleLiked() {
    if (!active) return
    try {
      replaceBoard(await api.moodboards.update(active.id, { liked: !liked }))
    } catch (err) {
      toast.error("Couldn't update", { description: (err as Error).message })
    }
  }

  if (loadError) {
    return (
      <Card className="mt-4">
        <CardContent className="py-14 text-center">
          <p className="font-display text-text text-xl">Couldn't load moodboards</p>
          <p className="text-muted mt-2 text-sm">{loadError}</p>
        </CardContent>
      </Card>
    )
  }

  if (boards === null) {
    return <Skeleton className="mt-4 h-96 w-full" />
  }

  if (!active) {
    return (
      <Card className="mt-4">
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <p className="font-display text-text text-xl">No moodboard yet.</p>
          <p className="text-muted max-w-md text-sm">
            Elation curates a concept from your questionnaire answers and real inventory. The more you've
            answered, the better it fits.
          </p>
          <Button onClick={regenerate} disabled={regenerating}>
            <Sparkles className="h-4 w-4" />
            {regenerating ? 'Curating…' : 'Curate my first concept'}
          </Button>
        </CardContent>
      </Card>
    )
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
                onClick={useInBudget}
                disabled={usingInBudget || active.board.items.length === 0}
              >
                <Wallet className="h-4 w-4" />
                {usingInBudget ? 'Drafting budget…' : 'Use in my budget'}
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
                {active.board.summary && (
                  <p className="text-muted mb-4 break-inside-avoid text-sm leading-relaxed">{active.board.summary}</p>
                )}
                {active.board.items.map((entry, i) => (
                  <button
                    key={`${active.id}-${entry.item.id}`}
                    type="button"
                    onClick={() => setSelected(entry)}
                    className="group relative mb-4 block w-full overflow-hidden rounded-2xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    style={{ height: i % 3 === 0 ? 300 : i % 3 === 1 ? 220 : 260 }}
                  >
                    {entry.item.imageUrl ? (
                      <img
                        src={entry.item.imageUrl}
                        alt={entry.item.name}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                      />
                    ) : (
                      // No photo uploaded yet: a palette-tinted card keeps the board readable.
                      <div
                        className="flex h-full w-full items-center justify-center"
                        style={{ background: active.board.palette[i % active.board.palette.length] ?? '#E1CBAD' }}
                      >
                        <ImageOff className="h-6 w-6 text-white/60" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent" />
                    <div className="absolute inset-x-3 bottom-2 text-white">
                      <p className="text-[9px] font-bold uppercase tracking-widest opacity-80">
                        {entry.budgetCategory ?? entry.item.category}
                      </p>
                      <p className="text-sm font-semibold leading-tight">{entry.item.name}</p>
                      <p className="text-[10px] text-white/80">
                        {entry.suggestedQty ? `${entry.suggestedQty} × ` : ''}
                        {formatPKR(entry.item.pricePkr)} / {entry.item.unit}
                      </p>
                    </div>
                  </button>
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
              onClick={() => setSelected(null)}
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
                    onClick={() => setSelected(null)}
                    aria-label="Close"
                    className="hover:bg-surface-2 rounded-lg p-2 transition"
                  >
                    <X className="text-muted h-4 w-4" />
                  </button>
                </div>

                {drawerItem.imageUrl && (
                  <img
                    src={drawerItem.imageUrl}
                    alt={drawerItem.name}
                    className="mt-5 h-56 w-full rounded-2xl object-cover"
                  />
                )}

                {selected?.reason && (
                  <p className="border-accent/30 bg-accent/10 text-text mt-5 rounded-2xl border px-4 py-3 text-sm">
                    {selected.reason}
                  </p>
                )}

                <dl className="mt-5 space-y-2 text-sm">
                  {selected?.suggestedQty != null && <Row label="Suggested quantity" value={String(selected.suggestedQty)} />}
                  {drawerItem.colour && <Row label="Colour" value={drawerItem.colour} />}
                  {drawerItem.material && <Row label="Material" value={drawerItem.material} />}
                  <Row label="Unit" value={drawerItem.unit} />
                  <Row
                    label="Price"
                    value={`${formatPKR(drawerItem.pricePkr)} / ${drawerItem.unit}`}
                  />
                  {drawerItem.tags.length > 0 && <Row label="Tags" value={drawerItem.tags.join(', ')} />}
                </dl>

                <div className="mt-6 flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => selected && void addToBudget(selected)}
                  >
                    Add to budget
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => requestSwap(drawerItem)}
                  >
                    Ask my consultant
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
