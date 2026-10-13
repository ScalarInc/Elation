import { useCallback, useEffect, useState } from 'react'
import { MoreHorizontal, Search, Users } from 'lucide-react'
import { adminApi } from '@/api/admin'
import { InviteClientDialog } from '@/components/admin/InviteClientDialog'
import { InviteResultDialog } from '@/components/admin/InviteResultDialog'
import { ManageAccessDialog } from '@/components/admin/ManageAccessDialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
import { toast } from '@/components/ui/toast'
import { daysUntil, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { AdminClient, AdminSummary, ClientStatus, InviteResult } from '@/types/admin'

const STATUS_FILTERS: { key: ClientStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Invited' },
  { key: 'active', label: 'Active' },
  { key: 'expired', label: 'Expired' },
  { key: 'revoked', label: 'Revoked' },
]

const STATUS_BADGE: Record<ClientStatus, { label: string; variant: 'warning' | 'success' | 'outline' | 'danger' }> = {
  pending: { label: 'Invited', variant: 'warning' },
  active: { label: 'Active', variant: 'success' },
  expired: { label: 'Expired', variant: 'outline' },
  revoked: { label: 'Revoked', variant: 'danger' },
}

export function AdminClientsPage() {
  const [clients, setClients] = useState<AdminClient[] | null>(null)
  const [admins, setAdmins] = useState<AdminSummary[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filter, setFilter] = useState<ClientStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null)
  const [managing, setManaging] = useState<AdminClient | null>(null)

  const load = useCallback(async () => {
    try {
      const [rows, adminRows] = await Promise.all([adminApi.clients.list(), adminApi.admins.list()])
      setClients(rows)
      setAdmins(adminRows)
      setLoadError(null)
    } catch (err) {
      setLoadError((err as Error).message)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /** Replace one row after an update without refetching the whole list. */
  function upsert(client: AdminClient) {
    setClients((prev) => {
      if (!prev) return [client]
      return prev.some((c) => c.id === client.id) ? prev.map((c) => (c.id === client.id ? client : c)) : [client, ...prev]
    })
  }

  async function resendInvite(client: AdminClient) {
    try {
      const result = await adminApi.clients.resendInvite(client.id)
      upsert(result.client)
      setInviteResult(result)
    } catch (err) {
      toast.error('Could not re-send the invitation', { description: (err as Error).message })
    }
  }

  async function setAccess(client: AdminClient, accessStatus: 'active' | 'revoked') {
    try {
      upsert(await adminApi.clients.update(client.id, { accessStatus }))
      toast.success(accessStatus === 'revoked' ? `${client.name} can no longer sign in` : `${client.name} reactivated`)
    } catch (err) {
      toast.error('Could not change access', { description: (err as Error).message })
    }
  }

  const query = search.trim().toLowerCase()
  const visible = (clients ?? []).filter(
    (c) =>
      (filter === 'all' || c.status === filter) &&
      (!query || c.name.toLowerCase().includes(query) || c.email.toLowerCase().includes(query)),
  )

  return (
    <div className="px-10 pb-12 pt-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-text text-3xl">Clients</h1>
          <p className="text-muted/70 mt-1 text-sm">Invite clients, manage their access period and consultant.</p>
        </div>
        <InviteClientDialog
          onInvited={(result) => {
            upsert(result.client)
            setInviteResult(result)
          }}
        />
      </header>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => {
            const count = f.key === 'all' ? clients?.length : clients?.filter((c) => c.status === f.key).length
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  'rounded-full px-4 py-1.5 text-xs font-semibold tracking-wide transition',
                  filter === f.key
                    ? 'bg-accent text-accent-fg shadow-sm'
                    : 'bg-surface text-muted border-border/10 hover:text-text border',
                )}
              >
                {f.label}
                <span className="ml-2 text-[10px] opacity-70">{count ?? '–'}</span>
              </button>
            )
          })}
        </div>
        <label className="border-border/10 bg-surface flex w-72 items-center gap-2 rounded-xl border px-3 py-2">
          <Search className="text-muted/60 h-4 w-4" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or email"
            className="text-text placeholder:text-muted/50 w-full bg-transparent text-sm outline-none"
          />
        </label>
      </div>

      {loadError ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="Couldn't load clients"
          description={loadError}
          action={<Button onClick={() => void load()}>Try again</Button>}
        />
      ) : clients === null ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title={clients.length === 0 ? 'No clients yet' : 'No clients match'}
          description={
            clients.length === 0
              ? 'Invite your first client to give them access to their private planning studio.'
              : 'Try a different filter or search.'
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-left text-sm">
              <thead className="text-muted/70 border-border/10 border-b text-[10px] font-bold uppercase tracking-widest">
                <tr>
                  <th className="px-5 py-3">Client</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Access until</th>
                  <th className="px-5 py-3">Consultant</th>
                  <th className="px-5 py-3 text-right">Events</th>
                  <th className="w-12 px-5 py-3" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => (
                  <ClientRow
                    key={c.id}
                    client={c}
                    onManage={() => setManaging(c)}
                    onResend={() => void resendInvite(c)}
                    onSetAccess={(status) => void setAccess(c, status)}
                  />
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <InviteResultDialog result={inviteResult} onClose={() => setInviteResult(null)} />
      <ManageAccessDialog client={managing} admins={admins} onClose={() => setManaging(null)} onSaved={upsert} />
    </div>
  )
}

function ClientRow({
  client,
  onManage,
  onResend,
  onSetAccess,
}: {
  client: AdminClient
  onManage: () => void
  onResend: () => void
  onSetAccess: (status: 'active' | 'revoked') => void
}) {
  const badge = STATUS_BADGE[client.status]
  const endsSoon = client.status !== 'expired' && client.status !== 'revoked' && daysUntil(client.accessExpiresAt) <= 7

  return (
    <tr className="border-border/10 hover:bg-surface-2/50 border-b last:border-0">
      <td className="px-5 py-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="text-xs">{client.avatarInitials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-text truncate font-semibold">{client.name}</p>
            <p className="text-muted/70 truncate text-xs">{client.email}</p>
          </div>
        </div>
      </td>
      <td className="px-5 py-3">
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </td>
      <td className="px-5 py-3">
        <span className={cn('text-text', endsSoon && 'text-warning font-semibold')}>
          {formatDate(client.accessExpiresAt)}
        </span>
        {endsSoon && <span className="text-warning ml-2 text-xs">{daysUntil(client.accessExpiresAt)}d left</span>}
      </td>
      <td className="text-muted px-5 py-3">{client.consultant?.name ?? 'Unassigned'}</td>
      <td className="text-text px-5 py-3 text-right tabular-nums">{client.eventCount}</td>
      <td className="px-5 py-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Actions for ${client.name}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={onManage}>Manage access…</DropdownMenuItem>
            {client.status === 'pending' && <DropdownMenuItem onSelect={onResend}>Re-send invitation</DropdownMenuItem>}
            {client.status === 'active' && <DropdownMenuItem onSelect={onResend}>Send set-password link</DropdownMenuItem>}
            <DropdownMenuSeparator />
            {client.accessStatus === 'revoked' ? (
              <DropdownMenuItem onSelect={() => onSetAccess('active')}>Reactivate access</DropdownMenuItem>
            ) : (
              <DropdownMenuItem className="text-danger" onSelect={() => onSetAccess('revoked')}>
                Revoke access
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  )
}
