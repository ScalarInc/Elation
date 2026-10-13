import type * as React from 'react'
import { RotateCw } from 'lucide-react'
import type { ClientStatus } from '@elation/shared/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/** Small building blocks shared by the admin console pages (docs/step-12-admin.md). */

export function AdminPage({ title, description, actions, children }: { title: string; description?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-8 md:py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-text text-2xl md:text-3xl">{title}</h1>
          {description && <p className="text-muted mt-1 text-sm">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  )
}

export function Panel({ title, actions, children, className }: { title?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('border-border/10 bg-surface rounded-3xl border p-5 md:p-6', className)}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="font-display text-text text-lg">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="border-border/10 bg-surface rounded-2xl border p-4">
      <p className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">{label}</p>
      <p className="font-display text-text mt-1 text-2xl">{value}</p>
      {hint && <p className="text-muted mt-0.5 text-xs">{hint}</p>}
    </div>
  )
}

const STATUS: Record<ClientStatus, { label: string; variant: 'success' | 'warning' | 'danger' | 'outline' }> = {
  active: { label: 'Active', variant: 'success' },
  invited: { label: 'Invited', variant: 'outline' },
  expired: { label: 'Expired', variant: 'warning' },
  revoked: { label: 'Revoked', variant: 'danger' },
}
export function StatusBadge({ status }: { status: ClientStatus }) {
  const s = STATUS[status]
  return <Badge variant={s.variant}>{s.label}</Badge>
}

export function LoadError({ onRetry, what = 'this' }: { onRetry: () => void; what?: string }) {
  return (
    <div className="py-10 text-center">
      <p className="text-muted text-sm">Couldn’t load {what}.</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
        <RotateCw className="h-3.5 w-3.5" /> Try again
      </Button>
    </div>
  )
}

export function Rows({ n = 5 }: { n?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: n }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-xl" />
      ))}
    </div>
  )
}

/** A horizontally scrollable table on small screens. */
export function Table({ head, children }: { head: React.ReactNode[]; children: React.ReactNode }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5 md:mx-0 md:px-0">
      <table className="w-full min-w-[880px] text-left text-sm">
        <thead>
          <tr className="border-border/10 text-muted/70 border-b text-[10px] font-bold uppercase tracking-widest">
            {head.map((h, i) => (
              <th key={i} className="px-3 py-2 font-bold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-border/10 divide-y">{children}</tbody>
      </table>
    </div>
  )
}
