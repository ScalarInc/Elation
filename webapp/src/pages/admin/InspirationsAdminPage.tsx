import type * as React from 'react'
import { useState } from 'react'
import { Eye, EyeOff, ImagePlus, Pencil, Plus, Trash2, X } from 'lucide-react'
import { BUDGET_TIERS, type AdminInspirationDto, type InspirationWriteBody } from '@elation/shared/api'
import { EVENT_TYPES } from '@elation/shared/domain'
import { AdminPage, LoadError, Panel, Rows } from '@/components/admin/kit'
import { inputClass } from '@/components/admin/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/admin/ConfirmDialog'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast'
import { adminApi, useAdminInspirations, useAdminInventory, useAdminMutation } from '@/data/admin'
import { useCurrentUser } from '@/data/auth'
import { isApiError } from '@/lib/api/client'
import { cn } from '@/lib/utils'
import { uploadFile } from '@/lib/upload'

const fail = (err: unknown) => toast.error(isApiError(err) ? err.message : err instanceof Error ? err.message : 'That didn’t work')
const keys = [['admin', 'inspirations'], ['inspirations']]

type Item = { inventoryItemId: string; category: string; qtyFixed: string; qtyPer100Guests: string }

/** Upload an image for the public gallery; resolves with its CDN URL. */
async function uploadImage(file: File) {
  const f = await uploadFile(file, { purpose: 'inspiration-image' })
  if (!f.url) throw new Error('That photo couldn’t be processed')
  return f.url
}

function ImagePicker({ onPicked, label }: { onPicked: (url: string) => void; label: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <Button asChild type="button" size="sm" variant="outline" disabled={busy}>
      <label className="cursor-pointer">
        <ImagePlus className="h-3.5 w-3.5" /> {busy ? 'Uploading…' : label}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            setBusy(true)
            try {
              onPicked(await uploadImage(file))
            } catch (err) {
              fail(err)
            } finally {
              setBusy(false)
            }
          }}
        />
      </label>
    </Button>
  )
}

function Editor({ concept, onClose }: { concept: AdminInspirationDto | 'new'; onClose: () => void }) {
  const c = concept === 'new' ? null : concept
  const inventory = useAdminInventory()
  const save = useAdminMutation((body: InspirationWriteBody) => adminApi.saveInspiration(c?.id ?? null, body), keys)
  const [f, setF] = useState({
    name: c?.name ?? '',
    eventTypes: c?.eventTypes ?? (['Mehndi'] as string[]),
    style: c?.style ?? '',
    palette: c?.palette.join(', ') ?? '',
    coverUrl: c?.coverUrl ?? '',
    summary: c?.summary ?? '',
    featured: c?.featured ?? false,
    budgetTier: c?.budgetTier ?? '',
    tiles: c?.tiles.map((t) => t.imageUrl) ?? ([] as string[]),
    items: c?.items.map((i) => ({ inventoryItemId: i.inventoryItemId, category: i.category, qtyFixed: i.qtyFixed ? String(i.qtyFixed) : '', qtyPer100Guests: i.qtyPer100Guests ? String(i.qtyPer100Guests) : '' })) ?? ([] as Item[]),
  })
  const [pick, setPick] = useState('')
  const set = (k: 'name' | 'style' | 'palette' | 'coverUrl' | 'summary' | 'budgetTier') => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((x) => ({ ...x, [k]: e.target.value }))
  const byId = new Map((inventory.data ?? []).map((i) => [i.id, i]))

  function submit(e: React.FormEvent) {
    e.preventDefault()
    save.mutate(
      {
        name: f.name.trim(),
        eventTypes: f.eventTypes as InspirationWriteBody['eventTypes'],
        style: f.style.trim(),
        palette: f.palette.split(/[\s,]+/).filter(Boolean),
        coverUrl: f.coverUrl.trim(),
        summary: f.summary.trim(),
        featured: f.featured,
        budgetTier: (f.budgetTier || null) as InspirationWriteBody['budgetTier'],
        tiles: f.tiles.map((imageUrl) => ({ imageUrl })),
        items: f.items.map((i) => ({
          inventoryItemId: i.inventoryItemId,
          category: i.category.trim() || 'Décor',
          qtyFixed: i.qtyFixed ? Number(i.qtyFixed) : null,
          qtyPer100Guests: i.qtyPer100Guests ? Number(i.qtyPer100Guests) : null,
        })),
      },
      { onSuccess: () => (toast.success(c ? 'Concept saved' : 'Concept created — publish it when it’s ready'), onClose()), onError: fail },
    )
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{c ? c.name : 'New concept'}</DialogTitle>
          <DialogDescription>Concepts clients can adopt from the inspiration gallery.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="c-name">Name</Label>
              <Input id="c-name" required minLength={2} value={f.name} onChange={set('name')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-style">Style</Label>
              <Input id="c-style" required value={f.style} onChange={set('style')} placeholder="Romantic · Modern Luxury" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-palette">Palette (hex)</Label>
              <Input id="c-palette" value={f.palette} onChange={set('palette')} placeholder="#E3BFB9, #E1CBAD" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-tier">Budget tier</Label>
              <select id="c-tier" className={inputClass} value={f.budgetTier} onChange={set('budgetTier')}>
                <option value="">—</option>
                {BUDGET_TIERS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
          <fieldset>
            <legend className="text-text mb-1.5 text-sm font-medium">Event types</legend>
            <div className="flex flex-wrap gap-1.5">
              {EVENT_TYPES.map((t) => {
                const on = f.eventTypes.includes(t)
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setF((x) => ({ ...x, eventTypes: on ? x.eventTypes.filter((v) => v !== t) : [...x.eventTypes, t] }))}
                    className={`rounded-full border px-3 py-1 text-xs ${on ? 'border-accent bg-accent/15 text-accent' : 'border-border/20 text-muted'}`}
                  >
                    {t}
                  </button>
                )
              })}
            </div>
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor="c-summary">Summary</Label>
            <Textarea id="c-summary" required rows={3} value={f.summary} onChange={set('summary')} />
          </div>
          <label className="text-text flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.featured} onChange={(e) => setF((x) => ({ ...x, featured: e.target.checked }))} /> Featured in the gallery
          </label>

          <div className="space-y-2">
            <Label>Cover</Label>
            <div className="flex items-center gap-3">
              {f.coverUrl && <img src={f.coverUrl} alt="" className="h-16 w-24 rounded-lg object-cover" />}
              <ImagePicker label={f.coverUrl ? 'Replace' : 'Upload cover'} onPicked={(url) => setF((x) => ({ ...x, coverUrl: url }))} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Gallery images · {f.tiles.length}</Label>
            <div className="flex flex-wrap gap-2">
              {f.tiles.map((url, i) => (
                <div key={`${url}-${i}`} className="relative">
                  <img src={url} alt="" className="h-16 w-16 rounded-lg object-cover" />
                  <button type="button" aria-label="Remove image" onClick={() => setF((x) => ({ ...x, tiles: x.tiles.filter((_, j) => j !== i) }))} className="bg-ink/70 absolute -right-1.5 -top-1.5 rounded-full p-0.5 text-white">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <ImagePicker label="Add image" onPicked={(url) => setF((x) => ({ ...x, tiles: [...x.tiles, url] }))} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Pieces · {f.items.length}</Label>
            {f.items.map((it, i) => (
              <div key={`${it.inventoryItemId}-${i}`} className="bg-surface-2 flex flex-wrap items-center gap-2 rounded-xl p-2 text-sm">
                <span className="text-text min-w-[140px] flex-1 truncate">{byId.get(it.inventoryItemId)?.name ?? 'Piece'}</span>
                <input aria-label="Group" value={it.category} onChange={(e) => setF((x) => ({ ...x, items: x.items.map((v, j) => (j === i ? { ...v, category: e.target.value } : v)) }))} className={cn(inputClass, 'h-8 w-28')} placeholder="Group" />
                <input aria-label="Fixed quantity" type="number" min={1} value={it.qtyFixed} onChange={(e) => setF((x) => ({ ...x, items: x.items.map((v, j) => (j === i ? { ...v, qtyFixed: e.target.value, qtyPer100Guests: '' } : v)) }))} className={cn(inputClass, 'h-8 w-20')} placeholder="Qty" />
                <span className="text-muted text-xs">or</span>
                <input aria-label="Per 100 guests" type="number" min={1} value={it.qtyPer100Guests} onChange={(e) => setF((x) => ({ ...x, items: x.items.map((v, j) => (j === i ? { ...v, qtyPer100Guests: e.target.value, qtyFixed: '' } : v)) }))} className={cn(inputClass, 'h-8 w-20')} placeholder="/100" />
                <button type="button" aria-label="Remove piece" onClick={() => setF((x) => ({ ...x, items: x.items.filter((_, j) => j !== i) }))} className="text-muted hover:text-danger">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <select aria-label="Add a piece" className={cn(inputClass, 'flex-1')} value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">Add a piece from the catalogue…</option>
                {(inventory.data ?? [])
                  .filter((i) => i.active)
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} ({i.sku})
                    </option>
                  ))}
              </select>
              <Button type="button" size="sm" variant="outline" disabled={!pick} onClick={() => (setF((x) => ({ ...x, items: [...x.items, { inventoryItemId: pick, category: byId.get(pick)?.category ?? '', qtyFixed: '1', qtyPer100Guests: '' }] })), setPick(''))}>
                Add
              </Button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending || !f.coverUrl || f.eventTypes.length === 0}>
              {!f.coverUrl ? 'Add a cover' : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function InspirationsAdminPage() {
  const me = useCurrentUser()
  const query = useAdminInspirations()
  const publish = useAdminMutation((v: { id: string; on: boolean }) => adminApi.publish(v.id, v.on), keys)
  const remove = useAdminMutation((id: string) => adminApi.deleteInspiration(id), keys)
  const [editing, setEditing] = useState<AdminInspirationDto | 'new' | null>(null)
  const [deleting, setDeleting] = useState<AdminInspirationDto | null>(null)
  const isAdmin = me.role === 'admin'

  return (
    <AdminPage
      title="Inspirations"
      description={isAdmin ? 'The concept gallery clients browse and adopt.' : 'The concept gallery clients browse and adopt. Drafts go live when an admin publishes them.'}
      actions={
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus className="h-3.5 w-3.5" /> New concept
        </Button>
      }
    >
      {editing && <Editor concept={editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(v) => !v && setDeleting(null)}
        title={`Delete ${deleting?.name ?? 'this concept'}?`}
        description="It disappears from the gallery for good. No client has adopted it."
        confirmLabel="Delete"
        busy={remove.isPending}
        onConfirm={() => remove.mutate(deleting!.id, { onSuccess: () => (setDeleting(null), toast.success('Concept deleted')), onError: fail })}
      />
      {query.isError ? (
        <LoadError onRetry={() => void query.refetch()} what="concepts" />
      ) : query.isPending ? (
        <Rows />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {query.data.map((c) => (
            <Panel key={c.id} className="p-0 md:p-0">
              <img src={c.coverUrl} alt="" className="aspect-[16/9] w-full rounded-t-3xl object-cover" />
              <div className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-text text-lg">{c.name}</p>
                    <p className="text-muted text-xs">{c.style}</p>
                  </div>
                  <Badge variant={c.published ? 'success' : 'outline'}>{c.published ? 'Live' : 'Draft'}</Badge>
                </div>
                <p className="text-muted text-xs">
                  {c.eventTypes.join(', ')} · {c.tiles.length} images · {c.items.length} pieces · adopted {c.adoptions}×
                </p>
                <div className="flex flex-wrap gap-1 pt-1">
                  <Button size="sm" variant="outline" onClick={() => setEditing(c)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  {isAdmin && (
                  <Button size="sm" variant="ghost" disabled={publish.isPending} onClick={() => publish.mutate({ id: c.id, on: !c.published }, { onError: fail })}>
                    {c.published ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {c.published ? 'Unpublish' : 'Publish'}
                  </Button>
                  )}
                  {me.role === 'admin' && c.adoptions === 0 && (
                    <Button size="sm" variant="ghost" aria-label={`Delete ${c.name}`} disabled={remove.isPending} onClick={() => setDeleting(c)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </AdminPage>
  )
}
