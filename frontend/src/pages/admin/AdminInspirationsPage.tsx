import { useCallback, useEffect, useState } from 'react'
import { Plus, Sparkles } from 'lucide-react'
import { adminApi } from '@/api/admin'
import { InspirationEditorDialog } from '@/components/admin/InspirationEditorDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import type { AdminInspiration, AdminInventoryItem } from '@/types/admin'

export function AdminInspirationsPage() {
  const [concepts, setConcepts] = useState<AdminInspiration[] | null>(null)
  const [inventory, setInventory] = useState<AdminInventoryItem[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editing, setEditing] = useState<AdminInspiration | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    try {
      const [rows, items] = await Promise.all([adminApi.inspirations.list(), adminApi.inventory.list()])
      setConcepts(rows)
      setInventory(items)
      setLoadError(null)
    } catch (err) {
      setLoadError((err as Error).message)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function upsert(concept: AdminInspiration) {
    setConcepts((prev) =>
      prev?.some((c) => c.id === concept.id) ? prev.map((c) => (c.id === concept.id ? concept : c)) : [concept, ...(prev ?? [])],
    )
    setEditing(concept) // keep the editor open on the saved concept (also turns "new" into "edit")
    setCreating(false)
  }

  return (
    <div className="px-10 pb-12 pt-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-text text-3xl">Inspirations</h1>
          <p className="text-muted/70 mt-1 text-sm">
            Ready-made concepts clients can browse and adopt. Only published concepts are visible to clients.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          New concept
        </Button>
      </header>

      {loadError ? (
        <EmptyState
          icon={<Sparkles className="h-6 w-6" />}
          title="Couldn't load concepts"
          description={loadError}
          action={<Button onClick={() => void load()}>Try again</Button>}
        />
      ) : concepts === null ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-56 w-full" />)}
        </div>
      ) : concepts.length === 0 ? (
        <EmptyState
          icon={<Sparkles className="h-6 w-6" />}
          title="No concepts yet"
          description="Create the first inspiration concept: add a name, style, photos and the inventory it uses."
          action={<Button onClick={() => setCreating(true)}>New concept</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {concepts.map((c) => (
            <Card key={c.id} className="overflow-hidden">
              <button type="button" onClick={() => setEditing(c)} className="block w-full text-left">
                <div className="bg-surface-2 h-36">
                  {c.coverUrl && <img src={c.coverUrl} alt="" className="h-full w-full object-cover" />}
                </div>
                <CardContent className="space-y-2 p-4">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant={c.isPublished ? 'success' : 'outline'}>{c.isPublished ? 'Published' : 'Draft'}</Badge>
                    {c.isFeatured && <Badge variant="accent">Featured</Badge>}
                    {c.budgetTier && <Badge variant="default">{c.budgetTier}</Badge>}
                  </div>
                  <p className="font-display text-text text-lg leading-tight">{c.name}</p>
                  <p className="text-muted/80 text-xs">
                    {c.items.length} item{c.items.length === 1 ? '' : 's'}
                    {c.eventTypes.length > 0 && ` · ${c.eventTypes.join(', ')}`}
                  </p>
                </CardContent>
              </button>
            </Card>
          ))}
        </div>
      )}

      <InspirationEditorDialog
        open={creating || editing !== null}
        inspiration={editing}
        inventory={inventory}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
        onSaved={upsert}
      />
    </div>
  )
}
