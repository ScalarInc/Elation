import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Crown, GripVertical, Heart, Info, Lock, MessageCircle, Repeat, Save, Sparkles, Star, Unlock, X } from 'lucide-react'
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { DENSITIES, VENUE_LOOKS, type MoodboardControls, type MoodboardDto, type MoodboardTileDto } from '@elation/shared/api'
import { MOODS, MOOD_LABELS, STYLES, STYLE_LABELS } from '@elation/shared/domain'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { formatPKR } from '@/lib/format'
import {
  eventMoodboardsKey,
  useEventMoodboards,
  useGenerateMoodboards,
  useMoodboardAction,
  useMoodboardDefaults,
  useTileAlternatives,
} from '@/data/moodboards'

type Props = { eventId: string }

const priceLabel = (tile: MoodboardTileDto) =>
  tile.item?.pricePKR != null ? `${formatPKR(tile.item.pricePKR)} / ${tile.item.unit}` : 'Price on request'

/** Pick the concept to show: the lead concept, else the newest. */
function defaultBoard(boards: MoodboardDto[]) {
  return boards.find((b) => b.isPrimary) ?? boards[0]
}

export function MoodboardViewer({ eventId }: Props) {
  const boardsQuery = useEventMoodboards(eventId)
  const defaultsQuery = useMoodboardDefaults(eventId)
  const generate = useGenerateMoodboards(eventId)
  const actions = useMoodboardAction()
  const qc = useQueryClient()

  const boards = useMemo(() => boardsQuery.data ?? [], [boardsQuery.data])
  const [activeId, setActiveId] = useState<string | null>(null)
  const active = boards.find((b) => b.id === activeId) ?? defaultBoard(boards)

  const [controls, setControls] = useState<MoodboardControls | null>(null)
  // Start from the concept's own controls, else the questionnaire-derived defaults.
  useEffect(() => {
    if (controls) return
    const start = active?.controls ?? defaultsQuery.data?.controls
    if (start) setControls(start)
  }, [active, defaultsQuery.data, controls])

  const [drawerTileId, setDrawerTileId] = useState<string | null>(null)
  const drawerTile = active?.tileItems.find((t) => t.id === drawerTileId) ?? null

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const set = <K extends keyof MoodboardControls>(key: K, value: MoodboardControls[K]) =>
    setControls((c) => (c ? { ...c, [key]: value } : c))

  async function regenerate() {
    if (!controls) return
    const hasLocks = active?.tileItems.some((t) => t.locked)
    try {
      const { concepts } = await generate.mutateAsync({ controls, keepLockedFrom: hasLocks ? active!.id : undefined, idempotencyKey: crypto.randomUUID() })
      setActiveId(concepts[0]?.id ?? null)
      toast.success('Elation curated a new direction', {
        description: `${MOOD_LABELS[controls.mood]} · ${STYLE_LABELS[controls.style]} · ${controls.density.toLowerCase()} florals`,
      })
    } catch (err) {
      toast.error('Could not curate right now', { description: (err as Error).message })
    }
  }

  function onDragEnd(e: DragEndEvent) {
    if (!active || !e.over || e.active.id === e.over.id) return
    const ids = active.tileItems.map((t) => t.id)
    const next = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)))
    // Optimistic: reorder in place, then persist.
    qc.setQueryData<MoodboardDto[]>(eventMoodboardsKey(eventId), (list) =>
      list?.map((b) =>
        b.id === active.id
          ? { ...b, tileItems: next.map((id, i) => ({ ...b.tileItems.find((t) => t.id === id)!, position: i })) }
          : b,
      ),
    )
    actions.reorder.mutate(
      { id: active.id, eventId, tileIds: next },
      { onError: (err) => toast.error('Could not save the new order', { description: err.message }) },
    )
  }

  if (boardsQuery.isPending || defaultsQuery.isPending || !controls) {
    return (
      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        <Skeleton className="h-[520px] w-full rounded-3xl" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }

  const latestGeneration = boards[0]?.generationId
  const saved = active?.status === 'saved'

  return (
    <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
      {/* Left controls */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <Card>
          <CardContent className="space-y-5 p-6">
            <header>
              <div className="flex items-center gap-2">
                <Sparkles className="text-accent h-4 w-4" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted/70">Curation controls</p>
              </div>
              <p className="font-display text-text mt-1 text-xl">Direct Elation</p>
            </header>

            <ControlGroup label="Mood">
              <ChipPicker options={MOODS} labels={MOOD_LABELS} value={controls.mood} onChange={(v) => set('mood', v)} />
            </ControlGroup>

            <ControlGroup label="Style">
              <ChipPicker options={STYLES} labels={STYLE_LABELS} value={controls.style} onChange={(v) => set('style', v)} />
            </ControlGroup>

            <ControlGroup label="Palette">
              <div className="flex flex-wrap items-center gap-2">
                {controls.palette.map((hex, i) => (
                  <button
                    key={hex}
                    type="button"
                    title={i === 0 ? `${hex} — leading colour` : `${hex} — make this the leading colour`}
                    onClick={() => set('palette', [hex, ...controls.palette.filter((h) => h !== hex)])}
                    className={cn('h-7 w-7 rounded-full ring-2 transition', i === 0 ? 'ring-accent' : 'ring-border/10 hover:ring-border/40')}
                    style={{ background: hex }}
                  />
                ))}
              </div>
              <p className="text-muted/70 mt-1.5 text-[11px]">Tap a colour to lead with it.</p>
            </ControlGroup>

            <ControlGroup label="Floral density">
              <ChipPicker options={DENSITIES} value={controls.density} onChange={(v) => set('density', v)} />
            </ControlGroup>

            <ControlGroup label="Venue">
              <select
                value={controls.venue}
                disabled={controls.venueLocked}
                onChange={(e) => set('venue', e.target.value as MoodboardControls['venue'])}
                className="border-border/15 bg-surface text-text focus:border-accent flex h-10 w-full rounded-xl border px-3 text-sm outline-none disabled:opacity-70"
              >
                {VENUE_LOOKS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <label className="text-muted mt-2 flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={controls.venueLocked}
                  onChange={(e) => set('venueLocked', e.target.checked)}
                  className="accent-accent h-3.5 w-3.5"
                />
                Keep venue locked while regenerating
              </label>
            </ControlGroup>

            <div className="space-y-2 pt-1">
              <Button className="w-full" onClick={regenerate} disabled={generate.isPending}>
                {generate.isPending ? (
                  <>
                    <span className="border-accent-fg/50 h-3.5 w-3.5 animate-spin rounded-full border-2 border-t-transparent" />
                    Curating…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    {boards.length ? 'Regenerate' : 'Curate my concepts'}
                  </>
                )}
              </Button>
              {active && !saved && (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={actions.save.isPending}
                  onClick={() =>
                    actions.save.mutate(active.id, {
                      onSuccess: (b) => toast.success('Concept saved', { description: b.isPrimary ? 'It’s now your lead concept.' : 'Added to your library.' }),
                      onError: (err) => toast.error('Could not save', { description: err.message }),
                    })
                  }
                >
                  <Save className="h-4 w-4" />
                  Save as concept
                </Button>
              )}
              {active && saved && !active.isPrimary && (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={actions.primary.isPending}
                  onClick={() =>
                    actions.primary.mutate(active.id, {
                      onSuccess: () => toast.success('Lead concept updated', { description: 'Your budget and AR preview follow this one.' }),
                    })
                  }
                >
                  <Crown className="h-4 w-4" />
                  Make this my lead concept
                </Button>
              )}
              {active?.tileItems.some((t) => t.locked) && (
                <p className="text-muted/70 text-center text-[11px]">Locked pieces stay when you regenerate.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </aside>

      {/* Right canvas */}
      <section className="min-w-0 space-y-5">
        {defaultsQuery.data?.fromQuestionnaire && (
          <div className="border-accent/30 bg-accent/10 flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs">
            <Sparkles className="text-accent h-3.5 w-3.5" />
            <span className="text-text font-semibold">Curated from your answers.</span>
            <span className="text-muted">Every piece comes from Elation’s own inventory.</span>
          </div>
        )}

        {!active ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
              <span className="bg-accent/15 text-accent flex h-12 w-12 items-center justify-center rounded-2xl">
                <Sparkles className="h-5 w-5" />
              </span>
              <p className="font-display text-text text-xl">No concepts yet</p>
              <p className="text-muted max-w-md text-sm">
                Set the mood on the left and Elation will curate concepts from its inventory — the more of the
                questionnaire you’ve answered, the closer they’ll be.
              </p>
              <Button onClick={regenerate} disabled={generate.isPending}>
                <Sparkles className="h-4 w-4" />
                Curate my concepts
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Concept strip */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {boards.map((b) => {
                  const on = b.id === active.id
                  return (
                    <button
                      key={b.id}
                      onClick={() => {
                        setActiveId(b.id)
                        if (b.controls) setControls(b.controls)
                      }}
                      className={cn(
                        'border-border/15 flex items-center gap-2 rounded-2xl border p-1.5 pr-3 text-left transition',
                        on ? 'border-accent bg-accent/10' : 'bg-surface hover:border-border/30',
                      )}
                    >
                      <span
                        className={cn(
                          'font-display flex h-9 w-9 items-center justify-center rounded-xl text-sm font-semibold',
                          on ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted',
                        )}
                      >
                        {b.isPrimary ? <Crown className="h-4 w-4" /> : b.variantLabel}
                      </span>
                      <span className={cn('max-w-[12rem] truncate text-xs font-semibold', on ? 'text-text' : 'text-muted')}>
                        {b.title}
                      </span>
                      {b.status === 'saved' ? (
                        <Star className="text-accent h-3 w-3 fill-current" aria-label="Saved" />
                      ) : b.generationId === latestGeneration ? (
                        <span className="text-muted/60 text-[9px] font-bold uppercase tracking-widest">New</span>
                      ) : null}
                    </button>
                  )
                })}
              </div>

              <button
                type="button"
                onClick={() => actions.patch.mutate({ id: active.id, liked: !active.liked })}
                className={cn(
                  'border-border/15 flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                  active.liked ? 'bg-accent/15 text-accent border-accent/30' : 'bg-surface text-muted hover:text-text',
                )}
              >
                <Heart className={cn('h-3.5 w-3.5', active.liked && 'fill-accent')} />
                {active.liked ? 'Loved' : 'Love this'}
              </button>
            </div>

            {/* Tiles — drag to rearrange */}
            <AnimatePresence mode="wait">
              {generate.isPending ? (
                <motion.div key="skeleton" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-2 gap-4 md:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className={cn('h-56', i % 2 && 'h-72')} />
                  ))}
                </motion.div>
              ) : (
                <motion.div key={active.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }}>
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                    <SortableContext items={active.tileItems.map((t) => t.id)} strategy={rectSortingStrategy}>
                      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                        {active.tileItems.map((tile, i) => (
                          <SortableTile
                            key={tile.id}
                            tile={tile}
                            tall={i % 4 === 0}
                            onOpen={() => setDrawerTileId(tile.id)}
                            onToggleLock={() => actions.updateTile.mutate({ id: active.id, tileId: tile.id, locked: !tile.locked })}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                  <p className="text-muted/60 mt-3 text-center text-[11px]">Drag pieces to rearrange · pin a piece to keep it when you regenerate</p>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </section>

      <AnimatePresence>
        {active && drawerTile && (
          <TileDrawer key={drawerTile.id} board={active} tile={drawerTile} onClose={() => setDrawerTileId(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}

function SortableTile({
  tile,
  tall,
  onOpen,
  onToggleLock,
}: {
  tile: MoodboardTileDto
  tall: boolean
  onOpen: () => void
  onToggleLock: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tile.id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('group relative overflow-hidden rounded-2xl', tall && 'row-span-2', isDragging && 'z-10 opacity-80 shadow-lift')}
    >
      <button
        type="button"
        onClick={onOpen}
        className="block h-full w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        aria-label={`About ${tile.item?.name ?? 'this piece'}`}
      >
        {tile.imageUrl ? (
          <img
            src={tile.imageUrl}
            alt={tile.item?.name ?? ''}
            className={cn('w-full object-cover transition duration-500 group-hover:scale-[1.03]', tall ? 'h-full min-h-[30rem]' : 'h-60')}
          />
        ) : (
          <div className={cn('bg-surface-2 w-full', tall ? 'min-h-[30rem]' : 'h-60')} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent" />
        <div className="absolute inset-x-3 bottom-2 text-left text-white">
          <p className="text-[9px] font-bold uppercase tracking-widest opacity-80">{tile.item?.category ?? tile.area}</p>
          <p className="text-sm font-semibold leading-tight">{tile.item?.name}</p>
          <p className="text-[10px] text-white/80">{priceLabel(tile)}</p>
        </div>
        <span className="bg-white/90 absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full opacity-0 shadow transition group-hover:opacity-100">
          <Info className="text-ink h-3.5 w-3.5" />
        </span>
      </button>
      <button
        type="button"
        onClick={onToggleLock}
        aria-label={tile.locked ? 'Unpin this piece' : 'Pin this piece'}
        className={cn(
          'absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full shadow transition',
          tile.locked ? 'bg-accent text-accent-fg' : 'bg-white/90 text-ink opacity-0 group-hover:opacity-100',
        )}
      >
        {tile.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
      </button>
      <span
        {...attributes}
        {...listeners}
        aria-label="Drag to rearrange"
        className="bg-white/90 text-ink absolute bottom-2 right-2 flex h-7 w-7 cursor-grab items-center justify-center rounded-full opacity-0 shadow transition group-hover:opacity-100"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </span>
    </div>
  )
}

function TileDrawer({ board, tile, onClose }: { board: MoodboardDto; tile: MoodboardTileDto; onClose: () => void }) {
  const actions = useMoodboardAction()
  const [showAlternatives, setShowAlternatives] = useState(false)
  const [note, setNote] = useState('')
  const [asking, setAsking] = useState(false)
  const alternatives = useTileAlternatives(board.id, showAlternatives ? tile.id : null)
  const item = tile.item

  return (
    <>
      <motion.div key="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
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
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted/70">{item?.category}</p>
              <h3 className="font-display text-text mt-1 text-2xl">{item?.name ?? 'Reference'}</h3>
            </div>
            <button onClick={onClose} aria-label="Close" className="hover:bg-surface-2 rounded-lg p-2 transition">
              <X className="text-muted h-4 w-4" />
            </button>
          </div>

          {tile.imageUrl && <img src={tile.imageUrl} alt={item?.name ?? ''} className="mt-5 h-56 w-full rounded-2xl object-cover" />}

          {item && (
            <dl className="mt-5 space-y-2 text-sm">
              <Row label="Colour" value={item.colour} swatch={item.colourHex} />
              {item.material && <Row label="Material" value={item.material} />}
              <Row label="Price" value={priceLabel(tile)} />
              <Row label="Used for" value={item.tags.map((t) => t.replace('-', ' ')).join(', ')} />
            </dl>
          )}

          {tile.reasons.length > 0 && (
            <div className="bg-accent/5 border-accent/20 mt-5 rounded-2xl border p-4">
              <p className="text-accent text-[10px] font-bold uppercase tracking-widest">Why Elation chose this</p>
              <ul className="text-text mt-2 flex flex-wrap gap-1.5 text-xs">
                {tile.reasons.map((r) => (
                  <li key={r} className="bg-surface rounded-full px-2.5 py-1">
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => actions.updateTile.mutate({ id: board.id, tileId: tile.id, locked: !tile.locked })}
            >
              {tile.locked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              {tile.locked ? 'Unpin' : 'Pin this piece'}
            </Button>
            <Button variant="outline" onClick={() => setShowAlternatives((s) => !s)}>
              <Repeat className="h-4 w-4" />
              {showAlternatives ? 'Hide alternatives' : 'See alternatives'}
            </Button>
            <Button variant="ghost" onClick={() => setAsking((a) => !a)}>
              <MessageCircle className="h-4 w-4" />
              Ask my consultant
            </Button>
          </div>

          {asking && (
            <div className="mt-4 space-y-2">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What would you change? (optional)" rows={3} />
              <Button
                size="sm"
                disabled={actions.consult.isPending}
                onClick={() =>
                  actions.consult.mutate(
                    { id: board.id, tileId: tile.id, note: note.trim() || undefined },
                    {
                      onSuccess: () => {
                        setAsking(false)
                        setNote('')
                        toast.success('Sent to your consultant', { description: 'They’ll suggest something that fits.' })
                      },
                      onError: (err) => toast.error('Could not send', { description: err.message }),
                    },
                  )
                }
              >
                Send
              </Button>
            </div>
          )}

          {showAlternatives && (
            <div className="mt-5 space-y-2">
              <p className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">From Elation’s inventory</p>
              {alternatives.isPending ? (
                <Skeleton className="h-20 w-full rounded-xl" />
              ) : (alternatives.data ?? []).length === 0 ? (
                <p className="text-muted text-xs">Nothing else in inventory fits this spot yet.</p>
              ) : (
                alternatives.data!.map((alt) => (
                  <div key={alt.item.id} className="border-border/10 flex items-center gap-3 rounded-xl border p-2">
                    {alt.item.image && <img src={alt.item.image} alt="" className="h-14 w-14 rounded-lg object-cover" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-text truncate text-sm font-semibold">{alt.item.name}</p>
                      <p className="text-muted truncate text-[11px]">{alt.reasons.slice(0, 2).join(' · ')}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={actions.updateTile.isPending}
                      onClick={() =>
                        actions.updateTile.mutate(
                          { id: board.id, tileId: tile.id, inventoryItemId: alt.item.id },
                          { onSuccess: () => toast.success(`Swapped in ${alt.item.name}`) },
                        )
                      }
                    >
                      Use this
                    </Button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </motion.aside>
    </>
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

function ChipPicker<T extends string>({
  options,
  labels,
  value,
  onChange,
}: {
  options: readonly T[]
  labels?: Record<T, string>
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={cn(
            'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
            o === value
              ? 'bg-accent text-accent-fg border-accent'
              : 'border-border/20 bg-surface text-muted hover:border-border/40 hover:text-text',
          )}
        >
          {labels?.[o] ?? o}
        </button>
      ))}
    </div>
  )
}

function Row({ label, value, swatch }: { label: string; value: string; swatch?: string | null }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-text flex items-center gap-2 text-right font-semibold">
        {swatch && <span className="h-3 w-3 rounded-full ring-1 ring-black/10" style={{ background: swatch }} />}
        {value}
      </dd>
    </div>
  )
}
