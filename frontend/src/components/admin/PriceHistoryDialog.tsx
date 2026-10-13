import { useEffect, useState } from 'react'
import { adminApi } from '@/api/admin'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { formatDate, formatPKR } from '@/lib/format'
import type { AdminInventoryItem, PriceChange } from '@/types/admin'

export function PriceHistoryDialog({ item, onClose }: { item: AdminInventoryItem | null; onClose: () => void }) {
  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        {item && <HistoryList key={item.id} item={item} />}
      </DialogContent>
    </Dialog>
  )
}

function HistoryList({ item }: { item: AdminInventoryItem }) {
  const [rows, setRows] = useState<PriceChange[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    adminApi.inventory.priceHistory(item.id).then(setRows, (err: Error) => setError(err.message))
  }, [item.id])

  return (
    <>
      <DialogHeader>
        <DialogTitle>Price history</DialogTitle>
        <DialogDescription>
          {item.name} · now {formatPKR(item.pricePkr)} / {item.unit}
        </DialogDescription>
      </DialogHeader>
      {error ? (
        <p className="text-danger text-sm">{error}</p>
      ) : rows === null ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : rows.length === 0 ? (
        <p className="text-muted py-4 text-sm">
          No edits yet.{item.isProvisionalPrice && ' The current price is the provisional seed estimate.'}
        </p>
      ) : (
        <ul className="divide-border/10 max-h-80 divide-y overflow-y-auto">
          {rows.map((r, i) => (
            <li key={i} className="flex items-center justify-between py-2.5 text-sm">
              <span className="tabular-nums">
                <span className="text-muted line-through">{formatPKR(r.oldPricePkr)}</span>
                <span className="text-text ml-2 font-semibold">{formatPKR(r.newPricePkr)}</span>
              </span>
              <span className="text-muted/80 text-xs">
                {r.changedByName ?? 'Unknown'} · {formatDate(r.changedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
