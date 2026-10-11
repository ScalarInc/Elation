import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Plus,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Trash2,
  Wallet,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/toast'
import { api } from '@/api'
import { formatPKR, formatPKRCompact } from '@/lib/format'
import { cn } from '@/lib/utils'
import type {
  BudgetLine,
  BudgetSnapshot,
  InventoryItem,
} from '@/types'
import { useResolvedEvent } from '@/hooks/useResolvedEvent'

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const BUDGET_MIN = 500_000
const BUDGET_MAX = 15_000_000
const BUDGET_STEP = 50_000

// Deterministic palette for donut slices (brand system).
const CATEGORY_PALETTE = [
  '#E3BFB9', // blush
  '#9AB1AE', // sage
  '#CFAE96', // tan
  '#E1CBAD', // beige
  '#D3A79F', // blush-deep
  '#7E9895', // sage-deep
  '#3B3A3F', // ink
]

// Preferred category display order (used when totals tie, and as base ordering
// before sorting-by-total desc).
const CATEGORY_ORDER = [
  'Stage',
  'Florals',
  'Ceiling',
  'Seating',
  'Dining',
  'Entrance',
  'Lighting',
  'Fabric',
]

// Rough hint of which InventoryItem.category values map into which budget
// "bucket" — used by the Add-from-inventory sheet to pre-filter.
const CATEGORY_TO_INVENTORY: Record<string, InventoryItem['category'][]> = {
  Stage: ['Backdrop', 'Sofa', 'Prop', 'Signage'],
  Florals: ['Floral'],
  Ceiling: ['Chandelier', 'Fabric'],
  Seating: ['Chair', 'Sofa'],
  Dining: ['Table', 'Chair', 'Floral'],
  Entrance: ['Prop', 'Signage', 'Lighting'],
  Lighting: ['Lighting', 'Chandelier'],
  Fabric: ['Fabric'],
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function makeLineId() {
  return `bl_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`
}

type Ratio = {
  total: number
  budget: number
  ratio: number
  delta: number // total - budget (positive = over)
  state: 'green' | 'yellow-over' | 'yellow-under' | 'red'
}

function classifyBudget(total: number, budget: number): Ratio {
  const safeBudget = budget > 0 ? budget : 1
  const ratio = total / safeBudget
  const delta = total - budget
  let state: Ratio['state']
  if (ratio > 1.15) state = 'red'
  else if (ratio > 1.0) state = 'yellow-over'
  else if (ratio < 0.7) state = 'yellow-under'
  else state = 'green'
  return { total, budget, ratio, delta, state }
}

type CategoryTotal = { category: string; total: number; count: number }

function groupByCategory(
  lines: BudgetLine[],
  inv: Map<string, InventoryItem>,
): CategoryTotal[] {
  const grouped = new Map<string, CategoryTotal>()
  for (const l of lines) {
    if (!l.included) continue
    const item = inv.get(l.itemId)
    if (!item) continue
    const sub = item.pricePKR * l.qty
    const bucket = grouped.get(l.category) ?? {
      category: l.category,
      total: 0,
      count: 0,
    }
    bucket.total += sub
    bucket.count += 1
    grouped.set(l.category, bucket)
  }
  // Sort by total desc; fall back to preferred order.
  return [...grouped.values()].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total
    return CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)
  })
}

function sortedCategoriesFromLines(
  lines: BudgetLine[],
  inv: Map<string, InventoryItem>,
): string[] {
  const totals = groupByCategory(lines, inv).map((c) => c.category)
  // Include categories with all-excluded lines too, at the bottom.
  const extras = [
    ...new Set(
      lines
        .map((l) => l.category)
        .filter((c) => !totals.includes(c)),
    ),
  ]
  return [...totals, ...extras]
}

function seedLinesFromEventType(): BudgetLine[] {
  // Minimal starter kit — used by the empty-state CTA.
  return [
    { id: makeLineId(), category: 'Stage', itemId: 'i_backdrop_arch', qty: 1, included: true },
    { id: makeLineId(), category: 'Stage', itemId: 'i_sofa_ivory', qty: 2, included: true },
    { id: makeLineId(), category: 'Seating', itemId: 'i_chair_gold', qty: 100, included: true },
    { id: makeLineId(), category: 'Ceiling', itemId: 'i_chand_crystal', qty: 1, included: true },
    { id: makeLineId(), category: 'Florals', itemId: 'i_floral_wild', qty: 8, included: true },
    { id: makeLineId(), category: 'Lighting', itemId: 'i_light_candle', qty: 6, included: true },
  ]
}

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
            We couldn't find the event you're trying to budget for. It may have been
            archived or the link is out of date.
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

function TrafficLightCard({ ratio }: { ratio: Ratio }) {
  const tone = ratio.state
  const isGreen = tone === 'green'
  const isRed = tone === 'red'

  const toneClass = isGreen
    ? 'bg-success/15 border-success/40 text-success'
    : isRed
    ? 'bg-danger/15 border-danger/40 text-danger'
    : 'bg-warning/15 border-warning/40 text-warning'

  const Icon = isGreen ? CheckCircle2 : isRed ? AlertOctagon : AlertTriangle

  const heading =
    tone === 'green'
      ? "You're on target"
      : tone === 'yellow-over'
      ? 'Slightly over budget'
      : tone === 'yellow-under'
      ? 'Under-investing'
      : 'Significantly over'

  const absDelta = Math.abs(ratio.delta)
  const body =
    tone === 'green'
      ? ratio.delta === 0
        ? 'Right at budget.'
        : `You have ${formatPKR(-ratio.delta)} to spare.`
      : tone === 'yellow-over'
      ? `${formatPKR(absDelta)} over — a small nudge from Elation could rebalance.`
      : tone === 'yellow-under'
      ? `${formatPKR(absDelta)} below budget — you may be under-serving your event.`
      : `${formatPKR(absDelta)} over budget — let's re-scope some categories with your consultant.`

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={tone}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          'flex items-start gap-4 rounded-3xl border p-5',
          toneClass,
        )}
      >
        <span
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/40',
          )}
        >
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

function CategoryDonut({
  categories,
}: {
  categories: CategoryTotal[]
}) {
  const total = categories.reduce((sum, c) => sum + c.total, 0)
  const size = 180
  const cx = size / 2
  const cy = size / 2
  const outer = 84
  const inner = 56

  if (total <= 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-6">
        <div
          className="border-border/15 flex h-32 w-32 items-center justify-center rounded-full border-8"
          aria-hidden
        />
        <p className="text-muted text-xs">Nothing included yet.</p>
      </div>
    )
  }

  let cursor = -Math.PI / 2 // start at 12 o'clock
  const paths = categories.map((c, i) => {
    const angle = (c.total / total) * Math.PI * 2
    const start = cursor
    const end = cursor + angle
    cursor = end
    const largeArc = angle > Math.PI ? 1 : 0

    const x1 = cx + outer * Math.cos(start)
    const y1 = cy + outer * Math.sin(start)
    const x2 = cx + outer * Math.cos(end)
    const y2 = cy + outer * Math.sin(end)
    const x3 = cx + inner * Math.cos(end)
    const y3 = cy + inner * Math.sin(end)
    const x4 = cx + inner * Math.cos(start)
    const y4 = cy + inner * Math.sin(start)

    const d = [
      `M ${x1} ${y1}`,
      `A ${outer} ${outer} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${x3} ${y3}`,
      `A ${inner} ${inner} 0 ${largeArc} 0 ${x4} ${y4}`,
      'Z',
    ].join(' ')

    return (
      <path
        key={c.category}
        d={d}
        fill={CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]}
        stroke="rgb(var(--surface))"
        strokeWidth={1.5}
      />
    )
  })

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="drop-shadow"
        >
          {paths}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">
            Total
          </p>
          <p className="font-display text-text text-lg leading-tight">
            {formatPKRCompact(total)}
          </p>
        </div>
      </div>

      <ul className="w-full space-y-1.5">
        {categories.map((c, i) => {
          const pct = Math.round((c.total / total) * 100)
          return (
            <li
              key={c.category}
              className="text-muted flex items-center gap-2 text-xs"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{
                  background:
                    CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
                }}
              />
              <span className="text-text flex-1 truncate font-semibold">
                {c.category}
              </span>
              <span className="tabular-nums">{formatPKRCompact(c.total)}</span>
              <span className="text-muted/70 w-8 text-right tabular-nums">
                {pct}%
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Add-from-inventory sheet
// -----------------------------------------------------------------------------

function AddInventorySheet({
  category,
  inventory,
  onAdd,
  trigger,
}: {
  category: string
  inventory: InventoryItem[]
  onAdd: (item: InventoryItem) => void
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const preferredCats = CATEGORY_TO_INVENTORY[category] ?? []

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    // Priority sort: preferred category first, then everything else.
    const scored = inventory.map((i) => {
      const catMatch = preferredCats.includes(i.category)
      const text = [
        i.name,
        i.colour,
        i.material ?? '',
        i.category,
        ...i.tags,
      ]
        .join(' ')
        .toLowerCase()
      const textMatch = q.length === 0 || text.includes(q)
      return { item: i, catMatch, textMatch }
    })
    return scored
      .filter((s) => s.textMatch)
      .sort((a, b) => Number(b.catMatch) - Number(a.catMatch))
      .map((s) => s.item)
  }, [inventory, query, preferredCats])

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="flex flex-col overflow-hidden">
        <SheetHeader>
          <SheetTitle>Add to {category}</SheetTitle>
          <SheetDescription>
            Pick anything from Elation's inventory — pricing updates instantly.
          </SheetDescription>
        </SheetHeader>

        <div className="relative">
          <Search className="text-muted/70 pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search velvet, gold, floral…"
            className="pl-9"
            autoFocus
          />
        </div>

        <div className="-mx-6 flex-1 overflow-y-auto px-6 pb-2 pt-3">
          {filtered.length === 0 ? (
            <p className="text-muted mt-6 text-center text-sm">
              No matches. Try a different keyword.
            </p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onAdd(item)
                      setOpen(false)
                    }}
                    className="border-border/10 bg-surface hover:shadow-soft flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition hover:-translate-y-0.5"
                  >
                    <img
                      src={item.image}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-xl object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-text truncate text-sm font-semibold">
                        {item.name}
                      </p>
                      <p className="text-muted/70 mt-0.5 truncate text-xs">
                        {item.category} · {item.colour}
                        {item.material ? ` · ${item.material}` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-text text-xs font-semibold tabular-nums">
                        {formatPKRCompact(item.pricePKR)}
                      </p>
                      <p className="text-muted/70 text-[10px]">/ {item.unit}</p>
                    </div>
                  </button>
                </li>
              ))}
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
  item,
  onQty,
  onToggle,
  onRemove,
}: {
  line: BudgetLine
  item: InventoryItem | undefined
  onQty: (qty: number) => void
  onToggle: (included: boolean) => void
  onRemove: () => void
}) {
  if (!item) {
    return (
      <div className="border-border/10 flex items-center justify-between gap-4 rounded-2xl border p-3">
        <p className="text-muted text-xs italic">Item no longer available</p>
        <Button variant="ghost" size="icon" onClick={onRemove} aria-label="Remove">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    )
  }

  const subtotal = item.pricePKR * line.qty
  const dimmed = !line.included

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'border-border/10 grid grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-4 rounded-2xl border p-3 transition',
        dimmed && 'opacity-55',
      )}
    >
      <img
        src={item.image}
        alt=""
        className="h-12 w-12 shrink-0 rounded-xl object-cover"
      />
      <div className="min-w-0">
        <p className="text-text truncate text-sm font-semibold">{item.name}</p>
        <p className="text-muted/70 truncate text-[11px]">
          {item.colour}
          {item.material ? ` · ${item.material}` : ''} · {formatPKR(item.pricePKR)} / {item.unit}
        </p>
      </div>
      <Input
        type="number"
        min={0}
        value={line.qty}
        onChange={(e) => {
          const next = Number(e.target.value)
          if (Number.isFinite(next) && next >= 0) onQty(next)
        }}
        className="h-9 w-20 text-right text-sm tabular-nums"
      />
      <div className="text-muted/70 hidden text-right text-[11px] sm:block">
        <p className="text-[10px] font-bold uppercase tracking-widest">Subtotal</p>
        <p className="text-text mt-0.5 text-sm font-semibold tabular-nums">
          {formatPKRCompact(subtotal)}
        </p>
      </div>
      <Switch
        checked={line.included}
        onCheckedChange={onToggle}
        aria-label={line.included ? 'Exclude line' : 'Include line'}
      />
      <Button
        variant="ghost"
        size="icon"
        onClick={onRemove}
        aria-label="Remove line"
        className="text-muted hover:text-danger"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </motion.div>
  )
}

// -----------------------------------------------------------------------------
// Main page
// -----------------------------------------------------------------------------

export function BudgetPage() {
  const { id } = useParams<{ id: string }>()
  const event = useResolvedEvent(id)

  const [loading, setLoading] = useState(true)
  const [snapshot, setSnapshot] = useState<BudgetSnapshot | undefined>(undefined)
  const [snapshotMissing, setSnapshotMissing] = useState(false)
  const [inventoryList, setInventoryList] = useState<InventoryItem[]>([])
  const [lines, setLines] = useState<BudgetLine[]>([])
  const [budget, setBudget] = useState<number>(0)
  const [initial, setInitial] = useState<{
    budget: number
    lines: BudgetLine[]
  } | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    Promise.all([api.budget.forEvent(id), api.inventory.list()])
      .then(([snap, inv]) => {
        if (cancelled) return
        setInventoryList(inv)
        if (snap) {
          setSnapshot(snap)
          setLines(snap.lines.map((l) => ({ ...l })))
          setBudget(snap.budgetPKR)
          setInitial({
            budget: snap.budgetPKR,
            lines: snap.lines.map((l) => ({ ...l })),
          })
          setSnapshotMissing(false)
        } else {
          setSnapshot(undefined)
          setSnapshotMissing(true)
          setBudget(event?.budgetPKR ?? 2_500_000)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const invById = useMemo(
    () => new Map(inventoryList.map((i) => [i.id, i])),
    [inventoryList],
  )

  const includedTotal = useMemo(
    () =>
      lines.reduce((sum, l) => {
        if (!l.included) return sum
        const item = invById.get(l.itemId)
        return item ? sum + item.pricePKR * l.qty : sum
      }, 0),
    [lines, invById],
  )

  const ratio = useMemo(
    () => classifyBudget(includedTotal, budget),
    [includedTotal, budget],
  )

  const categoryTotals = useMemo(
    () => groupByCategory(lines, invById),
    [lines, invById],
  )

  const categoriesInOrder = useMemo(
    () => sortedCategoriesFromLines(lines, invById),
    [lines, invById],
  )

  // ---------------- Handlers ----------------

  function updateLine(lineId: string, patch: Partial<BudgetLine>) {
    setLines((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, ...patch } : l)),
    )
  }

  function removeLine(lineId: string) {
    setLines((prev) => prev.filter((l) => l.id !== lineId))
  }

  function addLine(category: string, item: InventoryItem) {
    const line: BudgetLine = {
      id: makeLineId(),
      category,
      itemId: item.id,
      qty: 1,
      included: true,
    }
    setLines((prev) => [...prev, line])
    toast.success(`${item.name} added to ${category}`)
  }

  function resetToDefaults() {
    if (initial) {
      setLines(initial.lines.map((l) => ({ ...l })))
      setBudget(initial.budget)
      toast.success('Reset to Elation defaults')
    } else if (snapshot) {
      setLines(snapshot.lines.map((l) => ({ ...l })))
      setBudget(snapshot.budgetPKR)
    }
  }

  function sendToConsultant() {
    toast.success("Sent to Ayesha — she'll be in touch shortly.")
  }

  function requestQuote() {
    toast.success("Quote request logged — Elation will confirm within 24 hours.")
  }

  function seedFromQuestionnaire() {
    setLines(seedLinesFromEventType())
    setSnapshotMissing(false)
    toast.success('We seeded a starter budget from your answers.')
  }

  // ---------------- Render ----------------

  if (!id) return <EventNotFound />

  if (loading) {
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

  if (!event) return <EventNotFound />

  // Empty state — no snapshot for this event.
  if (snapshotMissing) {
    return (
      <div className="px-10 pb-12 pt-8">
        <div className="mb-6 flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/events/${event.id}`}>
              <ArrowLeft className="h-4 w-4" />
              Back to event
            </Link>
          </Button>
        </div>
        <EmptyState
          icon={<Wallet className="h-6 w-6" />}
          title="Start planning your budget"
          description="We haven't drafted line items for this event yet. Seed a starter list from your questionnaire and Elation will tune it from there."
          action={
            <Button onClick={seedFromQuestionnaire}>
              <Sparkles className="h-4 w-4" />
              Start planning your budget
            </Button>
          }
        />
      </div>
    )
  }

  // Main layout
  return (
    <div className="px-10 pb-12 pt-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-6 lg:col-span-2">
          <div className="bg-bg/80 sticky top-0 z-10 -mx-2 flex flex-wrap items-end justify-between gap-4 rounded-2xl px-2 py-3 backdrop-blur">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Button variant="ghost" size="sm" asChild className="-ml-2">
                  <Link to={`/events/${event.id}`}>
                    <ArrowLeft className="h-4 w-4" />
                    {event.concept ?? event.name}
                  </Link>
                </Button>
              </div>
              <h1 className="font-display text-text text-3xl">
                Smart Budget Estimator
              </h1>
              <p className="text-muted/70 mt-1 text-sm">
                Every rupee, live-priced against Elation's inventory.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" onClick={resetToDefaults}>
                <RotateCcw className="h-4 w-4" />
                Reset to Elation defaults
              </Button>
              <Button onClick={requestQuote}>
                <Send className="h-4 w-4" />
                Request a quote from Elation
              </Button>
            </div>
          </div>

          {/* Budget target editor */}
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">
                    Your target budget
                  </p>
                  <div className="mt-1 flex items-baseline gap-3">
                    <span className="text-muted text-sm">PKR</span>
                    <input
                      type="number"
                      min={BUDGET_MIN}
                      max={BUDGET_MAX}
                      step={BUDGET_STEP}
                      value={budget}
                      onChange={(e) => {
                        const n = Number(e.target.value)
                        if (Number.isFinite(n)) setBudget(n)
                      }}
                      className="font-display text-text w-56 bg-transparent text-4xl tabular-nums outline-none focus:text-accent"
                    />
                  </div>
                  <p className="text-muted/70 mt-1 text-xs">
                    ≈ {formatPKRCompact(budget)}
                  </p>
                </div>
                <Badge variant="outline">
                  {event.guests} guests · {event.venue.city}
                </Badge>
              </div>
              <div className="mt-6">
                <Slider
                  value={[Math.min(Math.max(budget, BUDGET_MIN), BUDGET_MAX)]}
                  min={BUDGET_MIN}
                  max={BUDGET_MAX}
                  step={BUDGET_STEP}
                  onValueChange={(v) => setBudget(v[0] ?? BUDGET_MIN)}
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
              const catLines = lines.filter((l) => l.category === category)
              const catTotal = catLines.reduce((sum, l) => {
                if (!l.included) return sum
                const item = invById.get(l.itemId)
                return item ? sum + item.pricePKR * l.qty : sum
              }, 0)

              return (
                <Card key={category}>
                  <CardContent className="p-6">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex items-baseline gap-3">
                        <h2 className="font-display text-text text-xl">
                          {category}
                        </h2>
                        <span className="text-muted/70 text-xs">
                          {catLines.filter((l) => l.included).length} of{' '}
                          {catLines.length} included
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-text text-sm font-semibold tabular-nums">
                          {formatPKRCompact(catTotal)}
                        </span>
                        <AddInventorySheet
                          category={category}
                          inventory={inventoryList}
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
                        {catLines.map((line, i) => (
                          <motion.div
                            key={line.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{
                              opacity: 1,
                              y: 0,
                              transition: { delay: i * 0.04 },
                            }}
                            exit={{ opacity: 0, y: -4 }}
                          >
                            <LineRow
                              line={line}
                              item={invById.get(line.itemId)}
                              onQty={(qty) => updateLine(line.id, { qty })}
                              onToggle={(included) =>
                                updateLine(line.id, { included })
                              }
                              onRemove={() => removeLine(line.id)}
                            />
                          </motion.div>
                        ))}
                      </AnimatePresence>

                      {catLines.length === 0 && (
                        <p className="text-muted/70 py-4 text-center text-xs italic">
                          Nothing here yet. Add an item to get started.
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}

            {/* Add a category the user hasn't touched — shortcut for full picker */}
            {categoriesInOrder.length < CATEGORY_ORDER.length && (
              <div className="border-border/15 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-dashed p-5">
                <div>
                  <p className="text-text text-sm font-semibold">
                    Missing a category?
                  </p>
                  <p className="text-muted/70 text-xs">
                    Add items to Fabric, Entrance, or anywhere else you'd like.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {CATEGORY_ORDER.filter(
                    (c) => !categoriesInOrder.includes(c),
                  ).map((c) => (
                    <AddInventorySheet
                      key={c}
                      category={c}
                      inventory={inventoryList}
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
            <TrafficLightCard ratio={ratio} />

            <Card>
              <CardContent className="p-6">
                <p className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">
                  Running totals
                </p>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted">Total</dt>
                    <dd className="text-text font-semibold tabular-nums">
                      {formatPKR(includedTotal)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Budget</dt>
                    <dd className="text-text font-semibold tabular-nums">
                      {formatPKR(budget)}
                    </dd>
                  </div>
                  <Separator className="my-2" />
                  <div className="flex justify-between">
                    <dt className="text-muted">Delta</dt>
                    <dd
                      className={cn(
                        'font-semibold tabular-nums',
                        ratio.delta > 0
                          ? 'text-danger'
                          : ratio.delta < 0
                          ? 'text-success'
                          : 'text-text',
                      )}
                    >
                      {ratio.delta > 0 ? '+' : ratio.delta < 0 ? '−' : ''}
                      {formatPKR(Math.abs(ratio.delta))}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <p className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">
                  Spend by category
                </p>
                <div className="mt-4">
                  <CategoryDonut categories={categoryTotals} />
                </div>
              </CardContent>
            </Card>

            <Button className="w-full" size="lg" onClick={sendToConsultant}>
              <Send className="h-4 w-4" />
              Send to my consultant
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BudgetPage
