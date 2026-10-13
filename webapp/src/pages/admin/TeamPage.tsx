import { useState } from 'react'
import { Copy, UserPlus } from 'lucide-react'
import type { TeamMemberDto } from '@elation/shared/api'
import { AdminPage, LoadError, Panel, Rows, StatusBadge, Table } from '@/components/admin/kit'
import { copy, inputClass, timeAgo } from '@/components/admin/format'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/admin/ConfirmDialog'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { adminApi, useAdminMutation, useTeam } from '@/data/admin'
import { useCurrentUser } from '@/data/auth'
import { isApiError } from '@/lib/api/client'
import { cn } from '@/lib/utils'

const fail = (err: unknown) => toast.error(isApiError(err) ? err.message : 'That didn’t work')

function MemberRow({ m, team }: { m: TeamMemberDto; team: TeamMemberDto[] }) {
  const me = useCurrentUser()
  const update = useAdminMutation((body: { role?: 'consultant' | 'admin'; active?: boolean; reassignClientsTo?: string }) => adminApi.updateStaff(m.id, body))
  const [moveTo, setMoveTo] = useState('')
  const [confirming, setConfirming] = useState(false)
  const others = team.filter((t) => t.id !== m.id && t.status === 'active')
  const isMe = m.id === me.id
  return (
    <tr>
      <td className="px-3 py-3">
        <p className="text-text font-semibold">
          {m.name}
          {isMe && <span className="text-muted text-xs"> (you)</span>}
        </p>
        <p className="text-muted text-xs">{m.email}</p>
      </td>
      <td className="px-3 py-3">
        <select
          aria-label={`Role of ${m.name}`}
          className={cn(inputClass, 'h-8 w-auto')}
          value={m.role}
          disabled={isMe || update.isPending}
          onChange={(e) => update.mutate({ role: e.target.value as 'consultant' | 'admin' }, { onSuccess: () => toast.success('Role updated'), onError: fail })}
        >
          <option value="consultant">Consultant</option>
          <option value="admin">Admin</option>
        </select>
      </td>
      <td className="px-3 py-3">
        <StatusBadge status={m.status} />
      </td>
      <td className="text-muted px-3 py-3">{m.clientCount}</td>
      <td className="text-muted px-3 py-3">{m.lastActiveAt ? timeAgo(m.lastActiveAt) : 'Never'}</td>
      <td className="px-3 py-3">
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={`Deactivate ${m.name}?`}
          description="They’ll be signed out everywhere and can’t sign in until reactivated."
          confirmLabel="Deactivate"
          busy={update.isPending}
          onConfirm={() => update.mutate({ active: false }, { onSuccess: () => (setConfirming(false), toast.success(`${m.name} can no longer sign in`)), onError: fail })}
        />
        {!isMe && (
          <div className="flex flex-wrap justify-end gap-1">
            {m.clientCount > 0 && (
              <>
                <select aria-label={`Move ${m.name}'s clients to`} className={cn(inputClass, 'h-8 w-36')} value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                  <option value="">Move clients to…</option>
                  {others.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
                <Button size="sm" variant="outline" disabled={!moveTo || update.isPending} onClick={() => update.mutate({ reassignClientsTo: moveTo }, { onSuccess: () => (setMoveTo(''), toast.success('Clients moved')), onError: fail })}>
                  Move
                </Button>
              </>
            )}
            {m.status === 'revoked' ? (
              <Button size="sm" variant="ghost" disabled={update.isPending} onClick={() => update.mutate({ active: true }, { onError: fail })}>
                Reactivate
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                disabled={update.isPending || m.clientCount > 0}
                title={m.clientCount > 0 ? 'Move their clients first' : undefined}
                onClick={() => setConfirming(true)}
              >
                Deactivate
              </Button>
            )}
          </div>
        )}
      </td>
    </tr>
  )
}

export function TeamPage() {
  const query = useTeam()
  const invite = useAdminMutation(adminApi.inviteStaff)
  const [form, setForm] = useState({ name: '', email: '', role: 'consultant' as 'consultant' | 'admin' })

  return (
    <AdminPage title="Team" description="Consultants and admins. Deactivating someone signs them out everywhere.">
      <Panel title="Invite a team member">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            invite.mutate(form, {
              onSuccess: (r) => {
                setForm({ name: '', email: '', role: 'consultant' })
                toast.success('Invitation sent', { action: { label: 'Copy link', onClick: () => void copy(r.activationUrl) } })
              },
              onError: fail,
            })
          }}
        >
          <Input aria-label="Name" placeholder="Name" required minLength={2} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-48" />
          <Input aria-label="Email" placeholder="Email" type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="w-60" />
          <select aria-label="Role" className={cn(inputClass, 'w-36')} value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as 'consultant' | 'admin' }))}>
            <option value="consultant">Consultant</option>
            <option value="admin">Admin</option>
          </select>
          <Button type="submit" disabled={invite.isPending}>
            <UserPlus className="h-4 w-4" /> Invite
          </Button>
        </form>
      </Panel>
      <Panel>
        {query.isError ? (
          <LoadError onRetry={() => void query.refetch()} what="the team" />
        ) : query.isPending ? (
          <Rows />
        ) : (
          <Table head={['Person', 'Role', 'Status', 'Clients', 'Last seen', '']}>
            {query.data.map((m) => (
              <MemberRow key={m.id} m={m} team={query.data} />
            ))}
          </Table>
        )}
      </Panel>
      <p className="text-muted/70 flex items-center gap-1 text-xs">
        <Copy className="h-3 w-3" /> Invitation links can also be shared directly — they work once, for 7 days.
      </p>
    </AdminPage>
  )
}
