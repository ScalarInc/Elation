import { useCallback, useEffect, useState } from 'react'
import { Boxes, ImageOff, MoreHorizontal, Plus, Search } from 'lucide-react'
import { adminApi } from '@/api/admin'
import { InlinePriceEditor } from '@/components/admin/InlinePriceEditor'
import { InventoryItemDialog } from '@/components/admin/InventoryItemDialog'
import { PriceHistoryDialog } from '@/components/admin/PriceHistoryDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/toast'
import { formatDate } from '@/lib/format'
import { INVENTORY_CATEGORIES } from '@/types'
import type { AdminInventoryItem } from '@/types/admin'

export function AdminInventoryPage() {
  const [items, setItems] = useState<AdminInventoryItem[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [category, setCategory] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState<AdminInventoryItem | null>(null)
  const [creating, setCreating] = useState(false)
  const [historyFor, setHistoryFor] = useState<AdminInventoryItem | null>(null)

  const load = useCallback(async () => {
    try {
      setItems(await adminApi.inventory.list())
      setLoadError(null)
    } catch (err) {
      setLoadError((err as Error).message)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function upsert(item: AdminInventoryItem) {
    setItems((prev) =>
      prev?.some((i) => i.id === item.id) ? prev.map((i) => (i.id === item.id ? item : i)) : [item, ...(prev ?? [])],
    )
  }

  async function savePrice(item: AdminInventoryItem, pricePkr: number) {
    try {
      upsert(await adminApi.inventory.update(item.id, { pricePkr }))
      toast.success(`${item.name}: price saved`)
    } catch (err) {
      toast.error('Could not save price', { description: (err as Error).message })
      throw err
    }
  }

  async function setActive(item: AdminInventoryItem, isActive: boolean) {
    try {
      upsert(await adminApi.inventory.update(item.id, { isActive }))
      toast.success(isActive ? `${item.name} restored` : `${item.name} archived — hidden from clients`)
    } catch (err) {
      toast.error('Could not update item', { description: (err as Error).message })
    }
  }

  const query = search.trim().toLowerCase()
  const visible = (items ?? []).filter(
    (i) =>
      (showArchived || i.isActive) &&
      (category === 'all' || i.category === category) &&
      (!query || i.name.toLowerCase().includes(query) || i.sku.includes(query) || i.tags.some((t) => t.includes(query))),
  )
  const provisionalCount = (items ?? []).filter((i) => i.isActive && i.isProvisionalPrice).length

  return (
    <div className="px-10 pb-12 pt-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-text text-3xl">Inventory</h1>
          <p className="text-muted/70 mt-1 text-sm">
            The catalogue behind recommendations and budgets. Click a price to change it.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          Add item
        </Button>
      </header>

      {provisionalCount > 0 && (
        <div className="border-warning/40 bg-warning/10 text-text mb-5 rounded-2xl border px-4 py-3 text-sm">
          <strong>{provisionalCount} item{provisionalCount === 1 ? '' : 's'}</strong> still use provisional seed prices.
          These are development estimates, not verified Elation prices. Saving a price marks it as confirmed.
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Filter by category"
          className="border-border/15 bg-surface text-text h-10 rounded-xl border px-3 text-sm outline-none"
        >
          <option value="all">All categories</option>
          {INVENTORY_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <label className="border-border/10 bg-surface flex w-72 items-center gap-2 rounded-xl border px-3 py-2">
          <Search className="text-muted/60 h-4 w-4" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, SKU or tag"
            className="text-text placeholder:text-muted/50 w-full bg-transparent text-sm outline-none"
          />
        </label>
        <label className="text-muted ml-auto flex items-center gap-2 text-sm">
          <Switch checked={showArchived} onCheckedChange={setShowArchived} aria-label="Show archived items" />
          Show archived
        </label>
      </div>

      {loadError ? (
        <EmptyState
          icon={<Boxes className="h-6 w-6" />}
          title="Couldn't load inventory"
          description={loadError}
          action={<Button onClick={() => void load()}>Try again</Button>}
        />
      ) : items === null ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Boxes className="h-6 w-6" />}
          title={items.length === 0 ? 'No inventory yet' : 'No items match'}
          description={
            items.length === 0
              ? 'Run the seed script or add your first item.'
              : 'Try a different category or search.'
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-left text-sm">
              <thead className="text-muted/70 border-border/10 border-b text-[10px] font-bold uppercase tracking-widest">
                <tr>
                  <th className="px-5 py-3">Item</th>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3">Unit</th>
                  <th className="px-5 py-3">Price</th>
                  <th className="px-5 py-3">Updated</th>
                  <th className="w-12 px-5 py-3" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.id} className={`border-border/10 border-b last:border-0 ${item.isActive ? '' : 'opacity-55'}`}>
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-3">
                        <div className="bg-surface-2 flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg">
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <ImageOff className="text-muted/40 h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-text truncate font-semibold">{item.name}</p>
                          <p className="text-muted/60 truncate text-[11px]">{item.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="text-muted px-5 py-2.5">{item.category}</td>
                    <td className="text-muted px-5 py-2.5">{item.unit}</td>
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2">
                        <InlinePriceEditor value={item.pricePkr} onSave={(next) => savePrice(item, next)} />
                        {item.isProvisionalPrice && <Badge variant="warning">Provisional</Badge>}
                        {!item.isActive && <Badge variant="outline">Archived</Badge>}
                      </div>
                    </td>
                    <td className="text-muted/80 px-5 py-2.5 text-xs">
                      {item.priceUpdatedAt ? formatDate(item.priceUpdatedAt) : '—'}
                    </td>
                    <td className="px-5 py-2.5">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`Actions for ${item.name}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onSelect={() => setEditing(item)}>Edit details…</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setHistoryFor(item)}>Price history</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {item.isActive ? (
                            <DropdownMenuItem className="text-danger" onSelect={() => void setActive(item, false)}>
                              Archive
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onSelect={() => void setActive(item, true)}>Restore</DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <InventoryItemDialog
        open={creating || editing !== null}
        item={editing}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
        onSaved={upsert}
      />
      <PriceHistoryDialog item={historyFor} onClose={() => setHistoryFor(null)} />
    </div>
  )
}
