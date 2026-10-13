import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  FilePlus2,
  Images,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Trash2,
  Wallet,
} from 'lucide-react'
import type { BudgetPlanDto, InventoryItemDto } from '@elation/shared/api'
import {
  BUDGET_CATEGORIES,
  BUDGET_CATEGORY_INVENTORY,
  budgetTotals,
  classifyBudget,
  type BudgetCategory,
  type BudgetClassification,
  type CategoryTotal,
} from '@elation/shared/budget'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { LoadError } from '@/components/ui/load-error'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/toast'
import { BUDGET_TONE, backTarget } from '@/components/budget/tone'
import { useCurrentUser } from '@/data/auth'
import { budgetApi, eventBudgetKey, useBudgetActions, useEventBudget } from '@/data/budget'
import { useEvent } from '@/data/events'
import { isPriced, useInventory } from '@/data/inventory'
import { isApiError } from '@/lib/api/client'
import { formatPKR, formatPKRCompact } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useQueryClient } from '@tanstack/react-query'

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const BUDGET_MIN = 100_000
const BUDGET_MAX = 15_000_000
const BUDGET_STEP = 50_000
/** Autosave this long after the last edit (docs/step-08-budget.md). */
const AUTOSAVE_MS = 800

// Deterministic palette for donut slices (brand system).
const CATEGORY_PALETTE = ['#E3BFB9', '#9AB1AE', '#CFAE96', '#E1CBAD', '#D3A79F', '#7E9895', '#3B3A3F']

// -----------------------------------------------------------------------------
// Local draft — edits apply instantly, then autosave to the server
// -----------------------------------------------------------------------------

type DraftLine = {
  key: string
  id?: string
  item: InventoryItemDto
  category: string
  qty: number
  included: boolean
  unitPricePkr: number
  currentPricePkr: number | null
}
type Draft = { targetPkr: number; lines: DraftLine[] }

const fromPlan = (plan: BudgetPlanDto): Draft => ({
  targetPkr: plan.targetPkr,
  lines: plan.lines.map((l) => ({
    key: l.id,
    id: l.id,
    item: l.item,
    category: l.category,
    qty: l.qty,
    included: l.included,
    unitPricePkr: l.unitPricePkr,
    currentPricePkr: l.currentPricePkr,
  })),
})

const toBody = (draft: Draft, version: number) => ({
  version,
  targetPkr: draft.targetPkr,
  lines: draft.lines.map((l) => ({ id: l.id, inventoryItemId: l.item.id, category: l.category, qty: l.qty, included: l.included })),
})

type SaveState = { state: 'idle' | 'saving' | 'saved' | 'error'; at?: number }

// -----------------------------------------------------------------------------
// Not-found panel
// -----------------------------------------------------------------------------

function EventNotFound() {
  return (
    <div className="px-10 pb-12 pt-8">
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <span className="bg-accent/15 text-accent flex h-14 w-14 items-center justify-center rounded-2xl">
            <Wallet className="h-6 w-6" />
          </span>
          <h1 className="font-display text-text text-2xl">Event not found</h1>
          <p className="text-muted/70 max-w-md text-sm">
            We couldn't find the event you're trying to budget for. It may have been archived or the link is out of date.
          </p>
          <Button asChild variant="outline">
            <Link to="/events">
              <ArrowLeft className="h-4 w-4" />
              Back to My Events
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Traffic-light card
// -----------------------------------------------------------------------------

function TrafficLightCard({ classification }: { classification: BudgetClassification }) {
  const tone = BUDGET_TONE[classification.state]
  const Icon = tone.Icon
  const abs = Math.abs(classification.deltaPkr)
  const heading =
    classification.state === 'green' ? "You're on budget" : classification.state === 'yellow' ? 'Under budget' : 'Over budget'
  const body =
    classification.state === 'green'
      ? classification.deltaPkr <= 0
        ? classification.deltaPkr === 0
          ? 'Right at budget.'
          : `You have ${formatPKR(abs)} to spare.`
        : `${formatPKR(abs)} over — within Elation's tolerance.`
      : classification.state === 'yellow'
        ? `${formatPKR(abs)} below your target — room to add a statement piece.`
        : `${formatPKR(abs)} over budget — let's re-scope some categories with your consultant.`

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={classification.state}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className={cn('flex items-start gap-4 rounded-3xl border p-5', tone.card)}
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/40">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="font-display text-lg leading-tight">{heading}</p>
          <p className="mt-1 text-xs opacity-90">{body}</p>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

// -----------------------------------------------------------------------------
// Donut chart (lightweight SVG)
// -----------------------------------------------------------------------------

function CategoryDonut({ categories }: { categories: CategoryTotal[] }) {
  const total = categories.reduce((sum, c) => sum + c.totalPkr, 0)
  const size = 180
  const cx = size / 2
  const cy = size / 2
  const outer = 84
  const inner = 56

  if (total <= 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-6">
        <div className="border-border/15 flex h-32 w-32 items-center justify-center rounded-full border-8" aria-hidden />
        <p className="text-muted text-xs">Nothing included yet.</p>
      </div>
    )
  }

  // Start at 12 o'clock; each slice starts where the previous ended.
  const starts = categories.reduce<number[]>(
    (acc, c, i) => [...acc, acc[i] + (c.totalPkr / total) * Math.PI * 2],
    [-Math.PI / 2],
  )
  const paths = categories.map((c, i) => {
    const start = starts[i]
    const end = starts[i + 1]
    const largeArc = end - start > Math.PI ? 1 : 0
    const d = [
      `M ${cx + outer * Math.cos(start)} ${cy + outer * Math.sin(start)}`,
      `A ${outer} ${outer} 0 ${largeArc} 1 ${cx + outer * Math.cos(end)} ${cy + outer * Math.sin(end)}`,
      `L ${cx + inner * Math.cos(end)} ${cy + inner * Math.sin(end)}`,
      `A ${inner} ${inner} 0 ${largeArc} 0 ${cx + inner * Math.cos(start)} ${cy + inner * Math.sin(start)}`,
      'Z',
    ].join(' ')
    return <path key={c.category} d={d} fill={CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]} stroke="rgb(var(--surface))" strokeWidth={1.5} />
  })

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="drop-shadow">
          {paths}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">Total</p>
          <p className="font-display text-text text-lg leading-tight">{formatPKRCompact(total)}</p>
        </div>
      </div>
      <ul className="w-full space-y-1.5">
        {categories.map((c, i) => (
          <li key={c.category} className="text-muted flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length] }} />
            <span className="text-text flex-1 truncate font-semibold">{c.category}</span>
            <span className="tabular-nums">{formatPKRCompact(c.totalPkr)}</span>
            <span className="text-muted/70 w-8 text-right tabular-nums">{Math.round((c.totalPkr / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Add-from-inventory sheet
// -----------------------------------------------------------------------------

function AddInventorySheet({
  category,
  inPlan,
  onAdd,
  trigger,
}: {
  category: string
  inPlan: Set<string>
  onAdd: (item: InventoryItemDto) => void
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const { data: inventory = [], isPending, isError, refetch } = useInventory()

  const filtered = useMemo(() => {
    const preferred = BUDGET_CATEGORY_INVENTORY[category as BudgetCategory] ?? []
    const q = query.trim().toLowerCase()
    return inventory
      .filter((i) => q.length === 0 || [i.name, i.colour, i.material ?? '', i.category, ...i.tags].join(' ').toLowerCase().includes(q))
      .map((item) => ({ item, rank: (preferred.includes(item.category) ? 2 : 0) + (isPriced(item) ? 1 : 0) }))
      .sort((a, b) => b.rank - a.rank)
      .map((s) => s.item)
  }, [inventory, query, category])

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="flex flex-col overflow-hidden">
        <SheetHeader>
          <SheetTitle>Add to {category}</SheetTitle>
          <SheetDescription>Pick anything from Elation's inventory — pricing updates instantly.</SheetDescription>
        </SheetHeader>

        <div className="relative">
          <Search className="text-muted/70 pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search velvet, gold, floral…" className="pl-9" autoFocus />
        </div>

        <div className="-mx-6 flex-1 overflow-y-auto px-6 pb-2 pt-3">
          {isPending ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : isError && inventory.length === 0 ? (
            <LoadError what="the inventory" onRetry={() => void refetch()} />
          ) : filtered.length === 0 ? (
            <p className="text-muted mt-6 text-center text-sm">No matches. Try a different keyword.</p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((item) => {
                const added = inPlan.has(item.id)
                const priced = isPriced(item)
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      disabled={added || !priced}
                      onClick={() => {
                        onAdd(item)
                        setOpen(false)
                      }}
                      className="border-border/10 bg-surface hover:shadow-soft flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {item.image ? <img src={item.image} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" /> : <span className="bg-bg h-14 w-14 shrink-0 rounded-xl" />}
                      <div className="min-w-0 flex-1">
                        <p className="text-text truncate text-sm font-semibold">{item.name}</p>
                        <p className="text-muted/70 mt-0.5 truncate text-xs">
                          {item.category} · {item.colour}
                          {item.material ? ` · ${item.material}` : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        {added ? (
                          <p className="text-muted text-[11px] font-semibold">In your budget</p>
                        ) : priced ? (
                          <>
                            <p className="text-text text-xs font-semibold tabular-nums">{formatPKRCompact(item.pricePKR)}</p>
                            <p className="text-muted/70 text-[10px]">/ {item.unit}</p>
                          </>
                        ) : (
                          <p className="text-muted text-[11px]">Price on request</p>
                        )}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// -----------------------------------------------------------------------------
// Line row
// -----------------------------------------------------------------------------

function LineRow({
  line,
  onQty,
  onToggle,
  onRemove,
}: {
  line: DraftLine
  onQty: (qty: number) => void
  onToggle: (included: boolean) => void
  onRemove: () => void
}) {
  const { item } = line
  const unavailable = line.currentPricePkr == null
  const repriced = !unavailable && line.currentPricePkr !== line.unitPricePkr

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'border-border/10 grid grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-4 rounded-2xl border p-3 transition',
        !line.included && 'opacity-55',
      )}
    >
      {item.image ? <img src={item.image} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" /> : <span className="bg-bg h-12 w-12 rounded-xl" />}
      <div className="min-w-0">
        <p className="text-text truncate text-sm font-semibold">{item.name}</p>
        <p className="text-muted/70 truncate text-[11px]">
          {item.colour}
          {item.material ? ` · ${item.material}` : ''} · {formatPKR(line.unitPricePkr)} / {item.unit}
        </p>
        {unavailable && <p className="text-warning text-[11px]">No longer available at a set price — your consultant will advise</p>}
        {repriced && <p className="text-warning text-[11px]">Now {formatPKR(line.currentPricePkr!)} / {item.unit}</p>}
      </div>
      <Input
        type="number"
        min={1}
        max={10_000}
        value={line.qty}
        aria-label={`Quantity of ${item.name}`}
        onChange={(e) => {
          const next = Math.floor(Number(e.target.value))
          if (Number.isFinite(next) && next >= 1 && next <= 10_000) onQty(next)
        }}
        className="h-9 w-20 text-right text-sm tabular-nums"
      />
      <div className="text-muted/70 hidden text-right text-[11px] sm:block">
        <p className="text-[10px] font-bold uppercase tracking-widest">Subtotal</p>
        <p className="text-text mt-0.5 text-sm font-semibold tabular-nums">{formatPKRCompact(line.unitPricePkr * line.qty)}</p>
      </div>
      <Switch checked={line.included} onCheckedChange={onToggle} aria-label={line.included ? 'Exclude line' : 'Include line'} />
      <Button variant="ghost" size="icon" onClick={onRemove} aria-label="Remove line" className="text-muted hover:text-danger">
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </motion.div>
  )
}

function SaveIndicator({ save }: { save: SaveState }) {
  if (save.state === 'idle') return null
  if (save.state === 'saving') {
    return (
      <span className="text-muted flex items-center gap-1.5 text-xs">
        <span className="bg-accent h-1.5 w-1.5 animate-pulse rounded-full" />
        Saving…
      </span>
    )
  }
  if (save.state === 'error') {
    return (
      <span className="text-danger flex items-center gap-1.5 text-xs">
        <span className="bg-danger h-1.5 w-1.5 rounded-full" />
        Not saved
      </span>
    )
  }
  return (
    <span className="text-muted flex items-center gap-1.5 text-xs">
      <span className="bg-success h-1.5 w-1.5 rounded-full" />
      Saved
    </span>
  )
}

// -----------------------------------------------------------------------------
// Start options (no plan yet)
// -----------------------------------------------------------------------------

function StartBudget({
  eventId,
  back,
  suggestedTargetPkr,
  hasMoodboard,
}: {
  eventId: string
  back: { to: string; label: string }
  suggestedTargetPkr: number
  hasMoodboard: boolean
}) {
  const { create } = useBudgetActions(eventId)
  const start = (seedFrom: 'moodboard' | 'rules' | 'blank') =>
    create.mutate(
      { seedFrom, targetPkr: suggestedTargetPkr },
      {
        onSuccess: ({ plan, unpricedItems }) => {
          const notes = [
            plan.lines.some((l) => !l.included) && 'A few pieces are switched off to fit your target — switch them on to see the full look.',
            unpricedItems.length > 0 &&
              `${unpricedItems.length} ${unpricedItems.length === 1 ? 'piece is' : 'pieces are'} priced on request — your consultant will add ${unpricedItems.length === 1 ? 'it' : 'them'}.`,
          ].filter(Boolean)
          toast.success(
            seedFrom === 'moodboard' ? 'Budget started from your moodboard' : seedFrom === 'rules' ? "Budget started from Elation's recommendation" : 'Blank budget ready',
            notes.length ? { description: notes.join(' ') } : undefined,
          )
        },
        onError: (err) => toast.error('Could not start the budget', { description: err.message }),
      },
    )

  const options = [
    ...(hasMoodboard
      ? [{ key: 'moodboard' as const, Icon: Images, title: 'Start from my moodboard', body: 'Every priced piece on your lead concept, sized for your guest count.' }]
      : []),
    { key: 'rules' as const, Icon: Sparkles, title: "Start from Elation's recommendation", body: 'Built from your event type, guests and questionnaire answers.' },
    { key: 'blank' as const, Icon: FilePlus2, title: 'Start blank', body: 'Add pieces yourself from Elation’s inventory.' },
  ]

  return (
    <div className="px-10 pb-12 pt-8">
      <Button variant="ghost" size="sm" asChild className="-ml-2 mb-4">
        <Link to={back.to}>
          <ArrowLeft className="h-4 w-4" />
          {back.label}
        </Link>
      </Button>
      <h1 className="font-display text-text text-3xl">Start your budget</h1>
      <p className="text-muted/70 mt-1 text-sm">
        Target {formatPKR(suggestedTargetPkr)} — you can change it any time. Everything saves as you go.
      </p>
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {options.map(({ key, Icon, title, body }) => (
          <button
            key={key}
            type="button"
            disabled={create.isPending}
            onClick={() => start(key)}
            className="border-border/10 bg-surface hover:shadow-soft flex flex-col items-start gap-3 rounded-3xl border p-6 text-left transition enabled:hover:-translate-y-0.5 disabled:opacity-60"
          >
            <span className="bg-accent/15 text-accent flex h-11 w-11 items-center justify-center rounded-2xl">
              <Icon className="h-5 w-5" />
            </span>
            <span className="font-display text-text text-lg leading-tight">{title}</span>
            <span className="text-muted text-sm">{body}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Estimator
// -----------------------------------------------------------------------------

function Estimator({
  eventId,
  plan,
  guests,
  city,
  back,
}: {
  eventId: string
  plan: BudgetPlanDto
  guests: number
  city: string
  back: { to: string; label: string }
}) {
  const me = useCurrentUser()
  const consultant = me.consultant?.name ?? 'your consultant'
  const qc = useQueryClient()
  const actions = useBudgetActions(eventId)

  const [draft, setDraft] = useState<Draft>(() => fromPlan(plan))
  const [save, setSave] = useState<SaveState>({ state: 'idle' })
  const version = useRef(plan.version)
  const edits = useRef(0) // bumps on every local edit
  const savedEdits = useRef(0) // edit count the server has
  const [dirty, setDirty] = useState(false)
  // Each save needs the version the previous one returned.
  const inFlight = useRef(false)
  const [retry, setRetry] = useState(0)
  const draftRef = useRef(draft)
  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  /** Take the server's plan as the new local state (after reset, reprice, conflicts…). */
  const adopt = useCallback((next: BudgetPlanDto) => {
    version.current = next.version
    savedEdits.current = edits.current
    setDirty(false)
    setDraft(fromPlan(next))
  }, [])

  const edit = (fn: (d: Draft) => Draft) => {
    edits.current += 1
    setDirty(true)
    setDraft(fn)
  }

  // Debounced autosave. One save at a time; the promise is kept so leaving the page can wait for it.
  const pending = useRef<Promise<unknown> | null>(null)
  useEffect(() => {
    if (!dirty) return
    const t = setTimeout(() => {
      if (inFlight.current) return
      inFlight.current = true
      const at = edits.current
      setSave({ state: 'saving' })
      const run = actions.save.mutateAsync(toBody(draftRef.current, version.current)).then(
        (saved) => {
          version.current = saved.version
          savedEdits.current = at
          // Nothing changed meanwhile: take the server's lines (ids for new lines, fresh prices).
          if (edits.current === at) {
            setDirty(false)
            setDraft(fromPlan(saved))
          } else {
            const ids = new Map(saved.lines.map((l) => [l.item.id, l.id]))
            setDraft((d) => ({ ...d, lines: d.lines.map((l) => (l.id ? l : { ...l, id: ids.get(l.item.id) })) }))
          }
          setSave({ state: 'saved', at: Date.now() })
        },
        (err: Error) => {
          if (isApiError(err, 'VERSION_CONFLICT')) {
            toast.error('This budget was changed elsewhere', {
              description: "Your last change wasn't saved — we've loaded the latest version so nothing is overwritten.",
            })
            void budgetApi.forEvent(eventId).then((r) => {
              if (r.plan) adopt(r.plan)
              qc.setQueryData(eventBudgetKey(eventId), r)
            })
            setSave({ state: 'idle' })
          } else {
            setSave({ state: 'error' })
            toast.error('Could not save your budget', { description: `${err.message} We'll keep trying.` })
            setTimeout(() => setRetry((n) => n + 1), 5000)
          }
        },
      )
      pending.current = run
      void run.finally(() => {
        inFlight.current = false
        // Edits made while this save was in flight go in the next one.
        if (edits.current !== at && edits.current !== savedEdits.current) setRetry((n) => n + 1)
      })
    }, AUTOSAVE_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, dirty, retry])

  // Leaving with an edit still waiting: save it on the way out (after any save in flight) and warn on tab close.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (edits.current !== savedEdits.current) e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      window.removeEventListener('beforeunload', warn)
      const flush = async () => {
        await pending.current?.catch(() => undefined)
        if (edits.current === savedEdits.current) return
        await budgetApi.save(eventId, toBody(draftRef.current, version.current))
        void qc.invalidateQueries({ queryKey: eventBudgetKey(eventId) })
        void qc.invalidateQueries({ queryKey: ['budgets'] })
      }
      flush().catch((err: Error) =>
        toast.error("Your last budget change wasn't saved", {
          description: isApiError(err, 'VERSION_CONFLICT') ? 'The budget was changed elsewhere in the meantime.' : err.message,
        }),
      )
    }
  }, [eventId, qc])

  const totals = useMemo(() => budgetTotals(draft.lines), [draft.lines])
  const classification = useMemo(() => classifyBudget(totals.includedPkr, draft.targetPkr), [totals, draft.targetPkr])
  const inPlan = useMemo(() => new Set(draft.lines.map((l) => l.item.id)), [draft.lines])
  // Sections keep a fixed order so they don't jump while the client types; the donut sorts by spend.
  const categoriesInOrder = useMemo(() => {
    const used = new Set(draft.lines.map((l) => l.category))
    const known: string[] = BUDGET_CATEGORIES.filter((c) => used.has(c))
    return [...known, ...[...used].filter((c) => !known.includes(c))]
  }, [draft.lines])

  const updateLine = (key: string, patch: Partial<DraftLine>) =>
    edit((d) => ({ ...d, lines: d.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }))
  const removeLine = (key: string) => edit((d) => ({ ...d, lines: d.lines.filter((l) => l.key !== key) }))
  const addLine = (category: string, item: InventoryItemDto) => {
    if (!isPriced(item)) return
    edit((d) => ({
      ...d,
      lines: [
        ...d.lines,
        { key: crypto.randomUUID(), item, category, qty: 1, included: true, unitPricePkr: item.pricePKR, currentPricePkr: item.pricePKR },
      ],
    }))
    // The autosave confirms it (and reports failures) — say what happened, not that it's saved.
    toast(`${item.name} added to ${category}`, { description: 'Saving…' })
  }
  const setTarget = (n: number) => edit((d) => ({ ...d, targetPkr: Math.max(0, Math.round(n)) }))

  const busy = dirty || save.state === 'saving'
  const serverAction = (label: string, run: () => Promise<BudgetPlanDto>, done: string) =>
    run().then(
      (next) => {
        adopt(next)
        toast.success(done)
      },
      (err: Error) => toast.error(`Could not ${label}`, { description: err.message }),
    )

  function resetToDefaults() {
    void serverAction('reset the budget', () => actions.reset.mutateAsync(), 'Reset to Elation defaults')
  }
  function reprice() {
    void serverAction('update prices', () => actions.reprice.mutateAsync(), "Updated to today's prices")
  }
  function sendToConsultant() {
    actions.sendToConsultant.mutate(undefined, {
      onSuccess: (r) => toast.success(`Sent to ${r.consultantName ?? 'your consultant'} — they'll be in touch shortly.`),
      onError: (err) => toast.error('Could not send', { description: err.message }),
    })
  }
  function requestQuote() {
    actions.quote.mutate(undefined, {
      onSuccess: () => toast.success(`Quote request sent — ${consultant} will confirm within 24 hours.`),
      onError: (err) => toast.error('Could not request a quote', { description: err.message }),
    })
  }

  return (
    <div className="px-10 pb-12 pt-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-6 lg:col-span-2">
          <div className="bg-bg/80 sticky top-0 z-10 -mx-2 flex flex-wrap items-end justify-between gap-4 rounded-2xl px-2 py-3 backdrop-blur">
            <div>
              <div className="mb-2 flex items-center gap-3">
                <Button variant="ghost" size="sm" asChild className="-ml-2">
                  <Link to={back.to}>
                    <ArrowLeft className="h-4 w-4" />
                    {back.label}
                  </Link>
                </Button>
                <SaveIndicator save={save} />
              </div>
              <h1 className="font-display text-text text-3xl">Smart Budget Estimator</h1>
              <p className="text-muted/70 mt-1 text-sm">Every rupee, priced against Elation's inventory.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" onClick={resetToDefaults} disabled={busy || actions.reset.isPending}>
                <RotateCcw className="h-4 w-4" />
                Reset to Elation defaults
              </Button>
              <Button onClick={requestQuote} disabled={busy || actions.quote.isPending}>
                <Send className="h-4 w-4" />
                {plan.status === 'submitted' && plan.changedSinceQuote ? 'Send updated quote request' : 'Request a quote from Elation'}
              </Button>
            </div>
          </div>

          {plan.pricesChanged && (
            <div className="border-warning/40 bg-warning/10 text-warning flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 text-sm">
              <span>Elation has updated some prices since you added these pieces. Your totals use the prices you saw.</span>
              <Button size="sm" variant="outline" onClick={reprice} disabled={busy || actions.reprice.isPending}>
                <RefreshCw className="h-3.5 w-3.5" />
                Use today's prices
              </Button>
            </div>
          )}
          {plan.status !== 'draft' && (
            <div className="border-border/15 bg-surface text-muted rounded-2xl border p-4 text-sm">
              {plan.changedSinceQuote
                ? `You've changed the budget since you sent it to ${consultant}. Send an updated request when you're ready.`
                : `${consultant} has your budget. You can keep adjusting it — changes save as you go.`}
            </div>
          )}

          {/* Budget target editor */}
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">Your target budget</p>
                  <div className="mt-1 flex items-baseline gap-3">
                    <span className="text-muted text-sm">PKR</span>
                    <input
                      type="number"
                      min={0}
                      step={BUDGET_STEP}
                      value={draft.targetPkr}
                      aria-label="Target budget in PKR"
                      onChange={(e) => {
                        const n = Number(e.target.value)
                        if (Number.isFinite(n)) setTarget(n)
                      }}
                      className="font-display text-text w-56 bg-transparent text-4xl tabular-nums outline-none focus:text-accent"
                    />
                  </div>
                  <p className="text-muted/70 mt-1 text-xs">≈ {formatPKRCompact(draft.targetPkr)}</p>
                </div>
                <Badge variant="outline">
                  {guests} guests · {city}
                </Badge>
              </div>
              <div className="mt-6">
                <Slider
                  value={[Math.min(Math.max(draft.targetPkr, BUDGET_MIN), BUDGET_MAX)]}
                  min={BUDGET_MIN}
                  max={BUDGET_MAX}
                  step={BUDGET_STEP}
                  onValueChange={(v) => setTarget(v[0] ?? BUDGET_MIN)}
                />
                <div className="text-muted/60 mt-2 flex justify-between text-[10px] font-semibold uppercase tracking-widest">
                  <span>{formatPKRCompact(BUDGET_MIN)}</span>
                  <span>{formatPKRCompact(BUDGET_MAX)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Line items grouped by category */}
          <div className="space-y-6">
            {categoriesInOrder.map((category) => {
              const catLines = draft.lines.filter((l) => l.category === category)
              const catTotal = totals.byCategory.find((c) => c.category === category)?.totalPkr ?? 0
              return (
                <Card key={category}>
                  <CardContent className="p-6">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex items-baseline gap-3">
                        <h2 className="font-display text-text text-xl">{category}</h2>
                        <span className="text-muted/70 text-xs">
                          {catLines.filter((l) => l.included).length} of {catLines.length} included
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-text text-sm font-semibold tabular-nums">{formatPKRCompact(catTotal)}</span>
                        <AddInventorySheet
                          category={category}
                          inPlan={inPlan}
                          onAdd={(item) => addLine(category, item)}
                          trigger={
                            <Button variant="outline" size="sm">
                              <Plus className="h-3.5 w-3.5" />
                              Add
                            </Button>
                          }
                        />
                      </div>
                    </div>
                    <Separator className="mb-4" />
                    <div className="space-y-2">
                      <AnimatePresence initial={false}>
                        {catLines.map((line) => (
                          <LineRow
                            key={line.key}
                            line={line}
                            onQty={(qty) => updateLine(line.key, { qty })}
                            onToggle={(included) => updateLine(line.key, { included })}
                            onRemove={() => removeLine(line.key)}
                          />
                        ))}
                      </AnimatePresence>
                    </div>
                  </CardContent>
                </Card>
              )
            })}

            {draft.lines.length === 0 && (
              <p className="text-muted/70 py-4 text-center text-sm italic">Nothing here yet — add pieces from Elation's inventory below.</p>
            )}

            {categoriesInOrder.length < BUDGET_CATEGORIES.length && (
              <div className="border-border/15 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-dashed p-5">
                <div>
                  <p className="text-text text-sm font-semibold">Missing a category?</p>
                  <p className="text-muted/70 text-xs">Add pieces to any part of the event.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {BUDGET_CATEGORIES.filter((c) => !categoriesInOrder.includes(c)).map((c) => (
                    <AddInventorySheet
                      key={c}
                      category={c}
                      inPlan={inPlan}
                      onAdd={(item) => addLine(c, item)}
                      trigger={
                        <Button variant="secondary" size="sm">
                          <Plus className="h-3.5 w-3.5" />
                          {c}
                        </Button>
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right sticky column */}
        <div className="lg:col-span-1">
          <div className="sticky top-6 space-y-4">
            <TrafficLightCard classification={classification} />

            <Card>
              <CardContent className="p-6">
                <p className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">Running totals</p>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted">Total</dt>
                    <dd className="text-text font-semibold tabular-nums">{formatPKR(totals.includedPkr)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Budget</dt>
                    <dd className="text-text font-semibold tabular-nums">{formatPKR(draft.targetPkr)}</dd>
                  </div>
                  <Separator className="my-2" />
                  <div className="flex justify-between">
                    <dt className="text-muted">Delta</dt>
                    <dd
                      className={cn(
                        'font-semibold tabular-nums',
                        classification.deltaPkr > 0 ? 'text-danger' : classification.deltaPkr < 0 ? 'text-success' : 'text-text',
                      )}
                    >
                      {classification.deltaPkr > 0 ? '+' : classification.deltaPkr < 0 ? '−' : ''}
                      {formatPKR(Math.abs(classification.deltaPkr))}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <p className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">Spend by category</p>
                <div className="mt-4">
                  <CategoryDonut categories={totals.byCategory} />
                </div>
              </CardContent>
            </Card>

            <Button className="w-full" size="lg" onClick={sendToConsultant} disabled={busy || actions.sendToConsultant.isPending}>
              <Send className="h-4 w-4" />
              Send to {me.consultant?.name ?? 'my consultant'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

export function BudgetPage() {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const eventQuery = useEvent(id)
  const event = eventQuery.data
  const eventPending = eventQuery.isPending && Boolean(id)
  const budget = useEventBudget(id)

  if (!id) return <EventNotFound />

  if (eventPending || budget.isPending) {
    return (
      <div className="px-10 pb-12 pt-8">
        <Skeleton className="h-10 w-64" />
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    )
  }

  // A 404 means "not found"; any other failure gets a retry.
  const failed = (q: { isError: boolean; error: unknown }) =>
    q.isError && !(isApiError(q.error) && q.error.status === 404)
  if ((!event && failed(eventQuery)) || (!budget.data && failed(budget))) {
    return (
      <div className="px-10 pb-12 pt-8">
        <LoadError
          what="this budget"
          className="py-16"
          onRetry={() => {
            if (eventQuery.isError) void eventQuery.refetch()
            if (budget.isError) void budget.refetch()
          }}
        />
      </div>
    )
  }

  if (!event || !budget.data) return <EventNotFound />
  const back = backTarget(params.get('from'), event.id, event.concept ?? event.name)

  if (!budget.data.plan) {
    return (
      <StartBudget
        eventId={event.id}
        back={back}
        suggestedTargetPkr={budget.data.suggestedTargetPkr}
        hasMoodboard={budget.data.hasMoodboard}
      />
    )
  }

  return (
    <Estimator
      key={budget.data.plan.id}
      eventId={event.id}
      plan={budget.data.plan}
      guests={event.guests}
      city={event.venue.city}
      back={back}
    />
  )
}

export default BudgetPage
