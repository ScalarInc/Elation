import type * as React from 'react'
import { useMemo, useState } from 'react'
import { Archive, Download, ImagePlus, Pencil, Plus, RotateCcw, Search, Upload } from 'lucide-react'
import { INVENTORY_AREAS, INVENTORY_CATEGORIES, INVENTORY_UNITS } from '@elation/shared/domain'
import type { InventoryImportReport, InventoryItemDto, InventoryWriteBody } from '@elation/shared/api'
import { AdminPage, LoadError, Panel, Rows, Table } from '@/components/admin/kit'
import { formatPkr, inputClass } from '@/components/admin/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast'
import { adminApi, useAdminInventory, useAdminMutation } from '@/data/admin'
import { isApiError } from '@/lib/api/client'
import { cn } from '@/lib/utils'
import { uploadFile } from '@/lib/upload'

const fail = (err: unknown) => toast.error(isApiError(err) ? err.message : err instanceof Error ? err.message : 'That didn’t work')
const keys = [['admin', 'inventory'], ['inventory']]

type Draft = { sku: string; name: string; category: string; colour: string; unit: string; price: string; stock: string; image: string; tags: string[]; notes: string }

const toDraft = (i: InventoryItemDto | null): Draft => ({
  sku: i?.sku ?? '',
  name: i?.name ?? '',
  category: i?.category ?? INVENTORY_CATEGORIES[0],
  colour: i?.colour ?? '',
  unit: i?.unit ?? 'each',
  price: i?.pricePKR != null ? String(i.pricePKR) : '',
  stock: i?.stockQty != null ? String(i.stockQty) : '',
  image: i?.image ?? '',
  tags: i?.tags ?? [],
  notes: i?.notes ?? '',
})

function ItemDialog({ item, onClose }: { item: InventoryItemDto | null | 'new'; onClose: () => void }) {
  const existing = item && item !== 'new' ? item : null
  const [d, setD] = useState<Draft>(() => toDraft(existing))
  const [uploading, setUploading] = useState(false)
  const save = useAdminMutation((body: InventoryWriteBody) => adminApi.saveInventory(existing?.id ?? null, body), keys)
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setD((x) => ({ ...x, [k]: e.target.value }))

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const body: InventoryWriteBody = {
      sku: d.sku.trim(),
      name: d.name.trim(),
      category: d.category as InventoryWriteBody['category'],
      colour: d.colour.trim(),
      unit: d.unit as InventoryWriteBody['unit'],
      pricePKR: d.price === '' ? null : Number(d.price),
      stockQty: d.stock === '' ? null : Number(d.stock),
      image: d.image || null,
      tags: d.tags as InventoryWriteBody['tags'],
      notes: d.notes.trim() || null,
      colourHex: existing?.colourHex ?? null,
      material: existing?.material ?? null,
      moodTags: (existing?.moodTags ?? []) as InventoryWriteBody['moodTags'],
      styleTags: (existing?.styleTags ?? []) as InventoryWriteBody['styleTags'],
      eventTypes: existing?.eventTypes ?? [],
    }
    save.mutate(body, { onSuccess: () => (toast.success(existing ? 'Piece updated' : 'Piece added'), onClose()), onError: fail })
  }

  async function pickImage(file: File | undefined) {
    if (!file) return
    setUploading(true)
    try {
      const f = await uploadFile(file, { purpose: 'inventory-image' })
      setD((x) => ({ ...x, image: f.url ?? x.image }))
    } catch (err) {
      fail(err)
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? existing.name : 'New piece'}</DialogTitle>
          <DialogDescription>Leave the price empty for “price on request” — unpriced pieces never go into budgets.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="i-sku">SKU</Label>
              <Input id="i-sku" required value={d.sku} onChange={set('sku')} disabled={Boolean(existing)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="i-name">Name</Label>
              <Input id="i-name" required minLength={2} value={d.name} onChange={set('name')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="i-cat">Category</Label>
              <select id="i-cat" className={inputClass} value={d.category} onChange={set('category')}>
                {INVENTORY_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="i-colour">Colour</Label>
              <Input id="i-colour" required value={d.colour} onChange={set('colour')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="i-price">Price (PKR per unit)</Label>
              <Input id="i-price" type="number" min={0} value={d.price} onChange={set('price')} placeholder="Price on request" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="i-unit">Unit</Label>
              <select id="i-unit" className={inputClass} value={d.unit} onChange={set('unit')}>
                {INVENTORY_UNITS.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="i-stock">In stock</Label>
              <Input id="i-stock" type="number" min={0} value={d.stock} onChange={set('stock')} placeholder="Not tracked" />
            </div>
            <div className="space-y-1.5">
              <Label>Photo</Label>
              <div className="flex items-center gap-2">
                {d.image && <img src={d.image} alt="" className="h-10 w-10 rounded-lg object-cover" />}
                <Button asChild type="button" size="sm" variant="outline" disabled={uploading}>
                  <label className="cursor-pointer">
                    <ImagePlus className="h-3.5 w-3.5" /> {uploading ? 'Uploading…' : 'Upload'}
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => void pickImage(e.target.files?.[0])} />
                  </label>
                </Button>
              </div>
            </div>
          </div>
          <fieldset>
            <legend className="text-text mb-1.5 text-sm font-medium">Where it's used</legend>
            <div className="flex flex-wrap gap-1.5">
              {INVENTORY_AREAS.map((a) => {
                const on = d.tags.includes(a)
                return (
                  <button
                    key={a}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setD((x) => ({ ...x, tags: on ? x.tags.filter((t) => t !== a) : [...x.tags, a] }))}
                    className={`rounded-full border px-3 py-1 text-xs ${on ? 'border-accent bg-accent/15 text-accent' : 'border-border/20 text-muted'}`}
                  >
                    {a}
                  </button>
                )
              })}
            </div>
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor="i-notes">Notes (staff only)</Label>
            <Textarea id="i-notes" rows={2} value={d.notes} onChange={set('notes')} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending || uploading || d.tags.length === 0}>
              {d.tags.length === 0 ? 'Choose an area' : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ImportDialog({ onClose }: { onClose: () => void }) {
  const [csv, setCsv] = useState('')
  const [report, setReport] = useState<InventoryImportReport | null>(null)
  const run = useAdminMutation((commit: boolean) => adminApi.importInventory(csv, commit), keys)
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Import the catalogue</DialogTitle>
          <DialogDescription>Upload Elation’s spreadsheet as CSV (same columns as the export). Check the preview, then apply.</DialogDescription>
        </DialogHeader>
        <input
          type="file"
          accept=".csv,text/csv"
          aria-label="CSV file"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (f) {
              setCsv(await f.text())
              setReport(null)
            }
          }}
          className="text-sm"
        />
        {report && (
          <div className="bg-surface-2 rounded-xl p-3 text-sm">
            <p className="text-text">
              {report.committed ? 'Applied' : 'Preview'}: {report.created} new · {report.updated} updated · {report.unchanged} unchanged
            </p>
            {report.errors.length > 0 && (
              <ul className="text-danger mt-2 max-h-40 space-y-1 overflow-y-auto text-xs">
                {report.errors.map((er) => (
                  <li key={er.line}>
                    Line {er.line}
                    {er.sku ? ` (${er.sku})` : ''}: {er.messages.join('; ')}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {report?.committed ? 'Done' : 'Cancel'}
          </Button>
          {!report?.committed && (
            <Button variant="outline" disabled={!csv || run.isPending} onClick={() => run.mutate(false, { onSuccess: setReport, onError: fail })}>
              Preview
            </Button>
          )}
          {report && !report.committed && report.errors.length === 0 && (
            <Button disabled={run.isPending} onClick={() => run.mutate(true, { onSuccess: (r) => (setReport(r), toast.success('Catalogue updated')), onError: fail })}>
              Apply
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function InventoryAdminPage() {
  const query = useAdminInventory()
  const archive = useAdminMutation((v: { id: string; archived: boolean }) => adminApi.archiveInventory(v.id, v.archived), keys)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'unpriced' | 'archived'>('all')
  const [editing, setEditing] = useState<InventoryItemDto | 'new' | null>(null)
  const [importing, setImporting] = useState(false)

  const items = useMemo(() => {
    const term = q.trim().toLowerCase()
    return (query.data ?? []).filter(
      (i) =>
        (filter === 'archived' ? !i.active : i.active) &&
        (filter !== 'unpriced' || i.pricePKR == null) &&
        (!term || i.name.toLowerCase().includes(term) || i.sku.toLowerCase().includes(term)),
    )
  }, [query.data, q, filter])
  const unpriced = (query.data ?? []).filter((i) => i.active && i.pricePKR == null).length

  return (
    <AdminPage
      title="Inventory"
      description="The catalogue Elation’s curation and budgets draw from."
      actions={
        <>
          <Button asChild variant="outline" size="sm">
            <a href="/api/v1/admin/inventory/export.csv" download>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </a>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImporting(true)}>
            <Upload className="h-3.5 w-3.5" /> Import CSV
          </Button>
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus className="h-3.5 w-3.5" /> New piece
          </Button>
        </>
      }
    >
      {editing && <ItemDialog item={editing} onClose={() => setEditing(null)} />}
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
      <Panel>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="border-border/15 flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border px-3">
            <Search className="text-muted/60 h-4 w-4" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or SKU" aria-label="Search inventory" className="text-text h-10 flex-1 bg-transparent text-sm outline-none" />
          </div>
          <select aria-label="Show" className={cn(inputClass, 'w-auto')} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="all">Active pieces</option>
            <option value="unpriced">Needs a price ({unpriced})</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        {query.isError ? (
          <LoadError onRetry={() => void query.refetch()} what="the catalogue" />
        ) : query.isPending ? (
          <Rows />
        ) : items.length === 0 ? (
          <p className="text-muted py-10 text-center text-sm">Nothing here.</p>
        ) : (
          <Table head={['Piece', 'Category', 'Price', 'Stock', 'Areas', '']}>
            {items.slice(0, 300).map((i) => (
              <tr key={i.id}>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-3">
                    {i.image ? <img src={i.image} alt="" loading="lazy" className="h-10 w-10 rounded-lg object-cover" /> : <span className="bg-surface-2 h-10 w-10 rounded-lg" />}
                    <div>
                      <p className="text-text font-semibold">{i.name}</p>
                      <p className="text-muted text-xs">{i.sku}</p>
                    </div>
                  </div>
                </td>
                <td className="text-muted px-3 py-2">{i.category}</td>
                <td className="px-3 py-2">{i.pricePKR != null ? <span className="text-text">{formatPkr(i.pricePKR)}</span> : <Badge variant="warning">On request</Badge>}</td>
                <td className="text-muted px-3 py-2">{i.stockQty ?? '—'}</td>
                <td className="text-muted px-3 py-2 text-xs">{i.tags.join(', ')}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(i)} aria-label={`Edit ${i.name}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={i.active ? `Archive ${i.name}` : `Restore ${i.name}`}
                      disabled={archive.isPending}
                      onClick={() => archive.mutate({ id: i.id, archived: i.active }, { onError: fail })}
                    >
                      {i.active ? <Archive className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </AdminPage>
  )
}
