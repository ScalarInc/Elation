import { useState } from 'react'
import { ImagePlus, Plus, Trash2, X } from 'lucide-react'
import { adminApi } from '@/api/admin'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast'
import { formatPKR } from '@/lib/format'
import { cn } from '@/lib/utils'
import { EVENT_TYPES, type EventType } from '@/types'
import type { AdminInspiration, AdminInventoryItem } from '@/types/admin'

const TIERS = ['Intimate', 'Signature', 'Grand'] as const
const HEX = /^#[0-9A-Fa-f]{6}$/

type Draft = {
  name: string
  summary: string
  styleTags: string
  palette: string
  eventTypes: EventType[]
  budgetTier: AdminInspiration['budgetTier']
  isFeatured: boolean
  isPublished: boolean
}

function toDraft(i: AdminInspiration | null): Draft {
  return {
    name: i?.name ?? '',
    summary: i?.summary ?? '',
    styleTags: i?.styleTags.join(', ') ?? '',
    palette: i?.palette.join(', ') ?? '',
    eventTypes: i?.eventTypes ?? [],
    budgetTier: i?.budgetTier ?? null,
    isFeatured: i?.isFeatured ?? false,
    isPublished: i?.isPublished ?? false,
  }
}

const splitList = (value: string) => value.split(',').map((v) => v.trim()).filter(Boolean)

/**
 * Create or edit an inspiration concept. Details save first; images and inventory become
 * available once the concept exists. `onSaved` receives every server update.
 */
export function InspirationEditorDialog({
  open,
  inspiration,
  inventory,
  onClose,
  onSaved,
}: {
  open: boolean
  inspiration: AdminInspiration | null
  inventory: AdminInventoryItem[]
  onClose: () => void
  onSaved: (inspiration: AdminInspiration) => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        {open && (
          <Editor key={inspiration?.id ?? 'new'} initial={inspiration} inventory={inventory} onClose={onClose} onSaved={onSaved} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function Editor({
  initial,
  inventory,
  onClose,
  onSaved,
}: {
  initial: AdminInspiration | null
  inventory: AdminInventoryItem[]
  onClose: () => void
  onSaved: (inspiration: AdminInspiration) => void
}) {
  const [current, setCurrent] = useState<AdminInspiration | null>(initial)
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial))
  const [saving, setSaving] = useState(false)

  function apply(saved: AdminInspiration) {
    setCurrent(saved)
    onSaved(saved)
  }

  const palette = splitList(draft.palette)
  const paletteError = palette.find((c) => !HEX.test(c))

  async function saveDetails() {
    if (draft.name.trim().length < 2) return toast.error('Give the concept a name')
    if (paletteError) return toast.error(`"${paletteError}" isn't a hex colour like #E3BFB9`)
    setSaving(true)
    const payload = {
      name: draft.name.trim(),
      summary: draft.summary.trim() || null,
      styleTags: splitList(draft.styleTags),
      palette,
      eventTypes: draft.eventTypes,
      budgetTier: draft.budgetTier,
      isFeatured: draft.isFeatured,
      isPublished: draft.isPublished,
    }
    try {
      apply(current ? await adminApi.inspirations.update(current.id, payload) : await adminApi.inspirations.create(payload))
      toast.success(current ? 'Concept saved' : 'Concept created. Add images and inventory below.')
    } catch (err) {
      toast.error("Couldn't save", { description: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  function toggleType(type: EventType) {
    setDraft((d) => ({
      ...d,
      eventTypes: d.eventTypes.includes(type) ? d.eventTypes.filter((t) => t !== type) : [...d.eventTypes, type],
    }))
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{current ? 'Edit concept' : 'New inspiration concept'}</DialogTitle>
        <DialogDescription>
          {current ? `/inspirations/${current.slug}` : 'Clients only see concepts marked as published.'}
        </DialogDescription>
      </DialogHeader>

      <section className="grid grid-cols-2 gap-4 pt-2">
        <Field label="Name" className="col-span-2">
          <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </Field>
        <Field label="Summary" className="col-span-2">
          <Textarea rows={3} value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} />
        </Field>
        <Field label="Style tags (comma-separated)">
          <Input placeholder="Regal, Modern Luxury" value={draft.styleTags} onChange={(e) => setDraft({ ...draft, styleTags: e.target.value })} />
        </Field>
        <Field label="Palette (hex, comma-separated)" error={paletteError ? `Invalid colour: ${paletteError}` : undefined}>
          <Input placeholder="#E3BFB9, #9AB1AE" value={draft.palette} onChange={(e) => setDraft({ ...draft, palette: e.target.value })} />
          <div className="flex gap-1.5 pt-1">
            {palette.filter((c) => HEX.test(c)).map((c) => (
              <span key={c} className="ring-border/20 h-5 w-5 rounded-full ring-1" style={{ background: c }} title={c} />
            ))}
          </div>
        </Field>
        <Field label="Suited to event types" className="col-span-2">
          <div className="flex flex-wrap gap-1.5">
            {EVENT_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggleType(t)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-semibold transition',
                  draft.eventTypes.includes(t) ? 'bg-accent text-accent-fg border-accent' : 'border-border/20 text-muted hover:text-text',
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Budget tier">
          <select
            value={draft.budgetTier ?? ''}
            onChange={(e) => setDraft({ ...draft, budgetTier: (e.target.value || null) as Draft['budgetTier'] })}
            className="border-border/15 bg-surface text-text flex h-10 w-full rounded-xl border px-3 text-sm outline-none"
          >
            <option value="">Not set</option>
            {TIERS.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <div className="flex items-end gap-6 pb-2">
          <label className="text-text flex items-center gap-2 text-sm">
            <Switch checked={draft.isPublished} onCheckedChange={(v) => setDraft({ ...draft, isPublished: v })} />
            Published
          </label>
          <label className="text-text flex items-center gap-2 text-sm">
            <Switch checked={draft.isFeatured} onCheckedChange={(v) => setDraft({ ...draft, isFeatured: v })} />
            Featured
          </label>
        </div>
        <div className="col-span-2 flex justify-end">
          <Button onClick={saveDetails} disabled={saving}>{saving ? 'Saving…' : current ? 'Save details' : 'Create concept'}</Button>
        </div>
      </section>

      {current && (
        <>
          <ImagesSection inspiration={current} onSaved={apply} />
          <InventorySection key={current.updatedAt} inspiration={current} inventory={inventory} onSaved={apply} />
        </>
      )}

      <div className="flex justify-end pt-2">
        <Button variant="ghost" onClick={onClose}>Close</Button>
      </div>
    </>
  )
}

function ImagesSection({ inspiration, onSaved }: { inspiration: AdminInspiration; onSaved: (i: AdminInspiration) => void }) {
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<AdminInspiration>, success: string) {
    setBusy(true)
    try {
      onSaved(await action())
      toast.success(success)
    } catch (err) {
      toast.error('Image update failed', { description: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  function picker(asCover: boolean) {
    return (
      <label className={cn('border-border/20 hover:border-accent/50 text-muted flex cursor-pointer items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-xs', busy && 'opacity-50')}>
        <ImagePlus className="h-4 w-4" />
        {asCover ? (inspiration.coverUrl ? 'Replace cover' : 'Upload cover') : 'Add gallery image'}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void run(() => adminApi.inspirations.addImage(inspiration.id, file, asCover), asCover ? 'Cover updated' : 'Image added')
          }}
        />
      </label>
    )
  }

  return (
    <section className="border-border/10 mt-6 border-t pt-5">
      <p className="text-muted/70 mb-3 text-[10px] font-bold uppercase tracking-widest">Images</p>
      <div className="flex flex-wrap items-start gap-3">
        {inspiration.coverUrl && <img src={inspiration.coverUrl} alt="Cover" className="h-20 w-28 rounded-xl object-cover ring-2 ring-accent" />}
        {inspiration.imageUrls.map((url, i) => (
          <div key={url} className="relative">
            <img src={url} alt="" className="h-20 w-28 rounded-xl object-cover" />
            <button
              type="button"
              aria-label="Remove image"
              disabled={busy}
              onClick={() => void run(() => adminApi.inspirations.removeImage(inspiration.id, inspiration.imagePaths[i]), 'Image removed')}
              className="bg-ink/70 absolute right-1 top-1 rounded-full p-1 text-white"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <div className="flex flex-col gap-2">
          {picker(true)}
          {picker(false)}
        </div>
      </div>
    </section>
  )
}

function InventorySection({
  inspiration,
  inventory,
  onSaved,
}: {
  inspiration: AdminInspiration
  inventory: AdminInventoryItem[]
  onSaved: (i: AdminInspiration) => void
}) {
  const [rows, setRows] = useState(() => inspiration.items.map((i) => ({ itemId: i.item.id, quantity: i.quantity })))
  const [toAddRaw, setToAdd] = useState('')
  const [saving, setSaving] = useState(false)
  const byId = new Map(inventory.map((i) => [i.id, i]))
  const available = inventory.filter((i) => i.isActive && !rows.some((r) => r.itemId === i.id))
  // Clears itself once the chosen item has been added.
  const toAdd = available.some((i) => i.id === toAddRaw) ? toAddRaw : ''

  async function save() {
    setSaving(true)
    try {
      onSaved(await adminApi.inspirations.setItems(inspiration.id, rows.map((r) => ({ inventoryItemId: r.itemId, quantity: r.quantity }))))
      toast.success('Inventory saved')
    } catch (err) {
      toast.error("Couldn't save inventory", { description: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="border-border/10 mt-6 border-t pt-5">
      <p className="text-muted/70 mb-1 text-[10px] font-bold uppercase tracking-widest">Inventory in this concept</p>
      <p className="text-muted/70 mb-3 text-xs">
        Carried into the client's moodboard and budget on adopt. Chairs and tables are re-sized to their guest count.
      </p>
      <ul className="space-y-2">
        {rows.map((row, idx) => {
          const item = byId.get(row.itemId)
          return (
            <li key={row.itemId} className="border-border/10 flex items-center gap-3 rounded-xl border px-3 py-2 text-sm">
              <span className="text-text min-w-0 flex-1 truncate">
                {item?.name ?? 'Unknown item'}
                <span className="text-muted/70 ml-2 text-xs">{item ? `${item.category} · ${formatPKR(item.pricePkr)} / ${item.unit}` : ''}</span>
              </span>
              <Input
                type="number"
                min={1}
                value={row.quantity}
                onChange={(e) => {
                  const quantity = Math.max(1, Number(e.target.value) || 1)
                  setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, quantity } : r)))
                }}
                className="h-8 w-20 text-right"
                aria-label="Quantity"
              />
              <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          )
        })}
      </ul>
      <div className="mt-3 flex gap-2">
        <select
          value={toAdd}
          onChange={(e) => setToAdd(e.target.value)}
          aria-label="Inventory item to add"
          className="border-border/15 bg-surface text-text h-10 min-w-0 flex-1 rounded-xl border px-3 text-sm outline-none"
        >
          <option value="">Choose an item…</option>
          {available.map((i) => (
            <option key={i.id} value={i.id}>{i.category} · {i.name}</option>
          ))}
        </select>
        <Button variant="outline" disabled={!toAdd} onClick={() => setRows((prev) => [...prev, { itemId: toAdd, quantity: 1 }])}>
          <Plus className="h-4 w-4" /> Add
        </Button>
        <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save inventory'}</Button>
      </div>
    </section>
  )
}

function Field({ label, error, className, children }: { label: string; error?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label>{label}</Label>
      {children}
      {error && <p className="text-danger text-xs">{error}</p>}
    </div>
  )
}
