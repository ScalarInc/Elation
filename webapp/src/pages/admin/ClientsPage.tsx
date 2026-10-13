import type * as React from 'react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Copy, Search, UserPlus } from 'lucide-react'
import { CLIENT_STATUSES, type ClientStatus } from '@elation/shared/api'
import { AdminPage, LoadError, Panel, Rows, StatusBadge, Table } from '@/components/admin/kit'
import { copy, formatDay, inputClass, timeAgo } from '@/components/admin/format'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/admin/ConfirmDialog'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/toast'
import { adminApi, useAdminClients, useAdminMutation, useSettings, useTeam } from '@/data/admin'
import { useCurrentUser } from '@/data/auth'
import { isApiError } from '@/lib/api/client'
import { cn } from '@/lib/utils'

export function InviteClientDialog({ open, onOpenChange, prefill }: { open: boolean; onOpenChange: (v: boolean) => void; prefill?: { name?: string; email?: string; phone?: string } }) {
  const me = useCurrentUser()
  const isAdmin = me.role === 'admin'
  const team = useTeam(isAdmin)
  const settings = useSettings()
  const invite = useAdminMutation(adminApi.invite)
  const [form, setForm] = useState({ name: prefill?.name ?? '', email: prefill?.email ?? '', phone: prefill?.phone ?? '', consultantId: '', accessDays: '' })
  const [link, setLink] = useState<string | null>(null)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  function submit(e: React.FormEvent) {
    e.preventDefault()
    invite.mutate(
      {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        consultantId: isAdmin && form.consultantId ? form.consultantId : undefined,
        accessDays: form.accessDays ? Number(form.accessDays) : undefined,
      },
      {
        onSuccess: (r) => {
          setLink(r.activationUrl)
          if (r.emailed) toast.success('Invitation sent', { description: `${form.name} will get an email with their activation link.` })
          else toast.warning('Invitation saved, but the email didn’t go out', { description: 'Copy the link below and send it yourself.' })
        },
        onError: (err) => toast.error(isApiError(err) ? err.message : 'Couldn’t send the invitation'),
      },
    )
  }

  function close(v: boolean) {
    onOpenChange(v)
    if (!v) {
      setLink(null)
      setForm({ name: '', email: '', phone: '', consultantId: '', accessDays: '' })
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite a client</DialogTitle>
          <DialogDescription>They get an email with a private activation link — you can also share it on WhatsApp.</DialogDescription>
        </DialogHeader>
        {link ? (
          <div className="space-y-4">
            <p className="text-muted text-sm">Activation link (valid for 7 days):</p>
            <div className="bg-surface-2 text-text break-all rounded-xl p-3 text-xs">{link}</div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => void copy(link).then((ok) => (ok ? toast.success('Link copied') : toast.error('Copy failed')))}>
                <Copy className="h-3.5 w-3.5" /> Copy link
              </Button>
              <Button onClick={() => close(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="inv-name">Name</Label>
                <Input id="inv-name" required minLength={2} value={form.name} onChange={set('name')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-email">Email</Label>
                <Input id="inv-email" type="email" required value={form.email} onChange={set('email')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-phone">Phone (optional)</Label>
                <Input id="inv-phone" value={form.phone} onChange={set('phone')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-days">Access (days)</Label>
                <Input id="inv-days" type="number" min={1} max={730} placeholder={String(settings.data?.defaultAccessDays ?? 90)} value={form.accessDays} onChange={set('accessDays')} />
              </div>
              {isAdmin && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="inv-consultant">Consultant</Label>
                  <select id="inv-consultant" className={inputClass} value={form.consultantId} onChange={set('consultantId')}>
                    <option value="">Me ({me.name})</option>
                    {(team.data ?? [])
                      .filter((m) => m.status === 'active' && m.id !== me.id)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={invite.isPending}>
                {invite.isPending ? 'Sending…' : 'Send invitation'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function ClientsPage() {
  const me = useCurrentUser()
  const [params, setParams] = useSearchParams()
  const status = (params.get('status') as ClientStatus | null) ?? undefined
  const [q, setQ] = useState(params.get('q') ?? '')
  const [cursor, setCursor] = useState(0)
  const sort = (params.get('sort') as 'recent' | 'name' | 'expiry' | 'event' | null) ?? 'recent'
  const query = useAdminClients({ status, q: params.get('q') ?? undefined, sort, cursor, limit: 50 })
  const [inviting, setInviting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const bulk = useAdminMutation(adminApi.bulk)
  const [bulkDays, setBulkDays] = useState('30')

  const setParam = (k: string, v: string | undefined) =>
    setParams((p) => {
      if (v) p.set(k, v)
      else p.delete(k)
      return p
    })
  const rows = query.data?.rows ?? []
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const [confirmRevoke, setConfirmRevoke] = useState(false)
  function runBulk(action: 'extend' | 'revoke', reason?: string) {
    const ids = [...selected]
    bulk.mutate(
      { ids, action, days: action === 'extend' ? Number(bulkDays) : undefined, reason },
      {
        onSuccess: (r) => {
          setSelected(new Set())
          setConfirmRevoke(false)
          if (r.failed.length) toast.warning(`${r.done.length} done, ${r.failed.length} not`, { description: r.failed[0].message })
          else toast.success(`${r.done.length} client${r.done.length === 1 ? '' : 's'} updated`)
        },
        onError: (err) => toast.error(isApiError(err) ? err.message : 'That didn’t work'),
      },
    )
  }

  return (
    <AdminPage
      title="Clients"
      description={me.role === 'admin' ? 'Every client account and its access window.' : 'Your clients and their access windows.'}
      actions={
        <Button onClick={() => setInviting(true)}>
          <UserPlus className="h-4 w-4" /> Invite client
        </Button>
      }
    >
      <InviteClientDialog open={inviting} onOpenChange={setInviting} />
      <ConfirmDialog
        open={confirmRevoke}
        onOpenChange={setConfirmRevoke}
        title={`Close ${selected.size} account${selected.size === 1 ? '' : 's'}?`}
        description="They’ll be signed out everywhere and can’t sign in until an admin restores them."
        confirmLabel="Close accounts"
        reasonLabel="Reason (kept in the access history)"
        busy={bulk.isPending}
        onConfirm={(reason) => runBulk('revoke', reason)}
      />
      <Panel>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setCursor(0)
              setParam('q', q.trim() || undefined)
            }}
            className="border-border/15 flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border px-3"
          >
            <Search className="text-muted/60 h-4 w-4" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or phone" aria-label="Search clients" className="text-text h-10 flex-1 bg-transparent text-sm outline-none" />
          </form>
          <select aria-label="Status" className={cn(inputClass, 'w-auto')} value={status ?? ''} onChange={(e) => (setCursor(0), setParam('status', e.target.value || undefined))}>
            <option value="">All statuses</option>
            {CLIENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
          <select aria-label="Sort" className={cn(inputClass, 'w-auto')} value={sort} onChange={(e) => setParam('sort', e.target.value)}>
            <option value="recent">Newest first</option>
            <option value="name">Name</option>
            <option value="expiry">Access ends soonest</option>
            <option value="event">Event soonest</option>
          </select>
        </div>

        {selected.size > 0 && (
          <div className="bg-accent/10 mb-3 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-sm">
            <span className="text-text font-semibold">{selected.size} selected</span>
            <span className="text-muted">· extend by</span>
            <input type="number" min={1} max={730} value={bulkDays} onChange={(e) => setBulkDays(e.target.value)} aria-label="Days" className={cn(inputClass, 'h-8 w-20')} />
            <span className="text-muted">days</span>
            <Button size="sm" disabled={bulk.isPending} onClick={() => runBulk('extend')}>
              Extend
            </Button>
            {me.role === 'admin' && (
              <Button size="sm" variant="outline" disabled={bulk.isPending} onClick={() => setConfirmRevoke(true)}>
                Revoke
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        )}

        {query.isError ? (
          <LoadError onRetry={() => void query.refetch()} what="clients" />
        ) : query.isPending ? (
          <Rows />
        ) : rows.length === 0 ? (
          <p className="text-muted py-10 text-center text-sm">{params.size ? 'No clients match these filters.' : 'No clients yet — invite your first one.'}</p>
        ) : (
          <>
            <Table head={['', 'Client', 'Status', 'Access ends', 'Event', 'Questionnaire', 'Consultant', 'Last seen']}>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2/60">
                  <td className="px-3 py-3">
                    <input type="checkbox" aria-label={`Select ${r.name}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                  </td>
                  <td className="px-3 py-3">
                    <Link to={`/admin/clients/${r.id}`} className="text-text font-semibold hover:underline">
                      {r.name}
                    </Link>
                    <p className="text-muted text-xs">{r.email}</p>
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={r.status} />
                    {r.hasOpenQuote && <span className="text-accent ml-1 text-[10px] font-bold uppercase">Quote</span>}
                  </td>
                  <td className="text-muted px-3 py-3">{formatDay(r.accessExpiresAt)}</td>
                  <td className="px-3 py-3">
                    {r.primaryEvent ? (
                      <>
                        <p className="text-text">{r.primaryEvent.name}</p>
                        <p className="text-muted text-xs">
                          {r.primaryEvent.type} · {formatDay(r.primaryEvent.date)}
                        </p>
                      </>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="text-muted px-3 py-3">{r.questionnairePercent}%</td>
                  <td className="text-muted px-3 py-3">{r.consultant?.name ?? '—'}</td>
                  <td className="text-muted px-3 py-3">{r.lastActiveAt ? timeAgo(r.lastActiveAt) : 'Never'}</td>
                </tr>
              ))}
            </Table>
            <div className="text-muted mt-4 flex items-center justify-between text-xs">
              <span>
                {cursor + 1}–{cursor + rows.length} of {query.data!.total}
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={cursor === 0} onClick={() => setCursor(Math.max(0, cursor - 50))}>
                  Previous
                </Button>
                <Button size="sm" variant="outline" disabled={query.data!.nextCursor == null} onClick={() => setCursor(query.data!.nextCursor!)}>
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </Panel>
    </AdminPage>
  )
}
