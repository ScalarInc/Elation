import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, MessageCircle, RotateCcw, Send, ShieldOff } from 'lucide-react'
import type { AdminClientDetail } from '@elation/shared/api'
import { AdminPage, LoadError, Panel, Rows, StatusBadge } from '@/components/admin/kit'
import { formatDay, formatPkr, inputClass, timeAgo } from '@/components/admin/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/admin/ConfirmDialog'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast'
import { adminApi, useAdminClient, useAdminMutation, useSettings, useTeam } from '@/data/admin'
import { useCurrentUser } from '@/data/auth'
import { isApiError } from '@/lib/api/client'
import { cn } from '@/lib/utils'

const ACTION_LABEL: Record<string, string> = {
  'user.invite': 'Invited',
  'user.reinvite': 'Invite re-sent',
  'user.extend': 'Access extended',
  'user.revoke': 'Account closed',
  'user.restore': 'Account restored',
  'user.reassign': 'Consultant changed',
  'user.update': 'Details updated',
  'user.expire': 'Access expired',
  'note.create': 'Note added',
}

const fail = (err: unknown) => toast.error(isApiError(err) ? err.message : 'That didn’t work — please try again')

function AccessPanel({ c }: { c: AdminClientDetail }) {
  const me = useCurrentUser()
  const isAdmin = me.role === 'admin'
  const settings = useSettings()
  const team = useTeam(isAdmin)
  const keys = [['admin']]
  const extend = useAdminMutation((days: number) => adminApi.extend(c.id, { days }), keys)
  const resend = useAdminMutation(() => adminApi.resendInvite(c.id), keys)
  const revoke = useAdminMutation((reason: string) => adminApi.revoke(c.id, reason), keys)
  const restore = useAdminMutation(() => adminApi.restore(c.id), keys)
  const reassign = useAdminMutation((consultantId: string) => adminApi.updateClient(c.id, { consultantId }), keys)
  const max = isAdmin ? 730 : (settings.data?.consultantMaxExtendDays ?? 30)
  const [days, setDays] = useState(String(Math.min(30, max)))
  const [reason, setReason] = useState('')
  const [confirming, setConfirming] = useState(false)

  return (
    <Panel title="Access">
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Close ${c.name}’s account?`}
        description="They’ll be signed out everywhere right away. An admin can restore the account later."
        confirmLabel="Close account"
        busy={revoke.isPending}
        onConfirm={() => revoke.mutate(reason, { onSuccess: () => (setReason(''), setConfirming(false), toast.success('Account closed — they’ve been signed out')), onError: fail })}
      />
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">Status</dt>
          <dd className="mt-1">
            <StatusBadge status={c.status} />
          </dd>
        </div>
        <div>
          <dt className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">Access ends</dt>
          <dd className="text-text mt-1">{formatDay(c.accessExpiresAt)}</dd>
        </div>
      </dl>

      <div className="mt-5 space-y-4">
        {c.status === 'invited' ? (
          <Button
            variant="outline"
            disabled={resend.isPending}
            onClick={() => resend.mutate(undefined, { onSuccess: () => toast.success('A new invitation was sent'), onError: fail })}
          >
            <Send className="h-3.5 w-3.5" /> Resend invitation
          </Button>
        ) : c.status !== 'revoked' ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              extend.mutate(Number(days), { onSuccess: (r) => toast.success(`Access now runs to ${formatDay(r.accessExpiresAt)}`), onError: fail })
            }}
          >
            <label htmlFor="extend-days" className="text-muted text-sm">
              Extend by
            </label>
            <input id="extend-days" type="number" min={1} max={max} value={days} onChange={(e) => setDays(e.target.value)} className={cn(inputClass, 'w-20')} />
            <span className="text-muted text-sm">days</span>
            <Button type="submit" size="sm" disabled={extend.isPending}>
              Extend
            </Button>
            {!isAdmin && <p className="text-muted/70 w-full text-xs">Up to {max} days at a time — ask an admin for longer.</p>}
          </form>
        ) : null}

        {isAdmin && c.status !== 'revoked' && (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              setConfirming(true)
            }}
          >
            <input required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for closing" aria-label="Reason" className={cn(inputClass, 'flex-1')} />
            <Button type="submit" size="sm" variant="destructive" disabled={revoke.isPending}>
              <ShieldOff className="h-3.5 w-3.5" /> Revoke
            </Button>
          </form>
        )}
        {isAdmin && c.status === 'revoked' && (
          <Button variant="outline" disabled={restore.isPending} onClick={() => restore.mutate(undefined, { onSuccess: () => toast.success('Account restored'), onError: fail })}>
            <RotateCcw className="h-3.5 w-3.5" /> Restore account
          </Button>
        )}

        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="consultant" className="text-muted text-sm">
              Consultant
            </label>
            <select
              id="consultant"
              className={cn(inputClass, 'flex-1')}
              value={c.consultant?.id ?? ''}
              disabled={reassign.isPending}
              onChange={(e) => reassign.mutate(e.target.value, { onSuccess: (r) => toast.success(`${r.consultant?.name} now looks after ${r.name}`), onError: fail })}
            >
              {!c.consultant && <option value="">—</option>}
              {(team.data ?? [])
                .filter((m) => m.status === 'active' || m.id === c.consultant?.id)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </select>
          </div>
        )}
      </div>
    </Panel>
  )
}

function NotesPanel({ c }: { c: AdminClientDetail }) {
  const add = useAdminMutation((v: { body: string; followUpAt?: string }) => adminApi.addNote(c.id, v), [['admin']])
  const done = useAdminMutation((v: { id: string; done: boolean }) => adminApi.updateNote(v.id, { done: v.done }), [['admin']])
  const [body, setBody] = useState('')
  const [followUp, setFollowUp] = useState('')
  return (
    <Panel title="Notes & follow-ups">
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault()
          add.mutate({ body, followUpAt: followUp || undefined }, { onSuccess: () => (setBody(''), setFollowUp('')), onError: fail })
        }}
      >
        <Textarea required value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Internal note — clients never see these" aria-label="Note" />
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="follow-up" className="text-muted text-xs">
            Follow up on
          </label>
          <input id="follow-up" type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} className={cn(inputClass, 'h-9 w-auto')} />
          <Button type="submit" size="sm" className="ml-auto" disabled={add.isPending || !body.trim()}>
            Add note
          </Button>
        </div>
      </form>
      <ul className="mt-4 space-y-2">
        {c.notes.map((n) => (
          <li key={n.id} className="bg-surface-2 rounded-2xl px-4 py-3 text-sm">
            <div className="flex items-start gap-2">
              <p className={`text-text min-w-0 flex-1 whitespace-pre-wrap ${n.doneAt ? 'line-through opacity-60' : ''}`}>{n.body}</p>
              {n.followUpAt && (
                <button type="button" onClick={() => done.mutate({ id: n.id, done: !n.doneAt }, { onError: fail })} className="text-muted hover:text-success shrink-0" aria-label={n.doneAt ? 'Mark not done' : 'Mark done'}>
                  <CheckCircle2 className={`h-4 w-4 ${n.doneAt ? 'text-success' : ''}`} />
                </button>
              )}
            </div>
            <p className="text-muted/70 mt-1 text-[11px]">
              {n.author.name} · {timeAgo(n.createdAt)}
              {n.followUpAt && ` · follow up ${formatDay(n.followUpAt)}`}
            </p>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

export function ClientDetailPage() {
  const { id } = useParams()
  const query = useAdminClient(id)
  const c = query.data

  return (
    <AdminPage
      title={c?.name ?? 'Client'}
      description={c ? `${c.email}${c.phone ? ` · ${c.phone}` : ''}${c.city ? ` · ${c.city}` : ''}` : undefined}
      actions={
        <>
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin/clients">
              <ArrowLeft className="h-3.5 w-3.5" /> All clients
            </Link>
          </Button>
          {c && c.threads[0] && (
            <Button asChild variant="outline" size="sm">
              <Link to={`/admin/messages?thread=${c.threads[0].id}`}>
                <MessageCircle className="h-3.5 w-3.5" /> Message
              </Link>
            </Button>
          )}
        </>
      }
    >
      {query.isError ? (
        <LoadError onRetry={() => void query.refetch()} what="this client" />
      ) : !c ? (
        <Rows n={6} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Panel title={`Events · ${c.events.length}`}>
              {c.events.length === 0 ? (
                <p className="text-muted py-4 text-sm">No events yet.</p>
              ) : (
                <ul className="divide-border/10 divide-y">
                  {c.events.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm">
                      <div className="min-w-[180px] flex-1">
                        <p className="text-text font-semibold">
                          {e.name} {e.status === 'archived' && <Badge variant="outline">Archived</Badge>}
                        </p>
                        <p className="text-muted text-xs">
                          {e.type} · {formatDay(e.date)} · {e.guests ?? '—'} guests
                        </p>
                      </div>
                      <span className="text-muted text-xs">Questionnaire {e.questionnairePercent}%</span>
                      <span className="text-muted text-xs">
                        {e.moodboards} concept{e.moodboards === 1 ? '' : 's'}
                      </span>
                      <span className="text-muted text-xs">{e.budget ? `${formatPkr(e.budget.totalPkr)} of ${formatPkr(e.budget.targetPkr)}` : 'No budget'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            {c.quotes.length > 0 && (
              <Panel title="Quotes" actions={<Link to="/admin/quotes" className="text-accent text-xs font-semibold">Quotes queue →</Link>}>
                <ul className="divide-border/10 divide-y text-sm">
                  {c.quotes.map((q) => (
                    <li key={q.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="text-text">{q.eventName}</span>
                      <span className="text-muted">{formatPkr(q.totalPkr)}</span>
                      <Badge variant={q.status === 'quoted' ? 'success' : q.status === 'closed' ? 'outline' : 'warning'}>{q.status.replace('_', ' ')}</Badge>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
            <NotesPanel c={c} />
          </div>
          <div className="space-y-6">
            <AccessPanel c={c} />
            <Panel title="Access history">
              {c.access.length === 0 && <p className="text-muted text-sm">No changes recorded yet.</p>}
              <ul className="space-y-2 text-sm">
                {c.access.map((a) => (
                  <li key={a.id}>
                    <p className="text-text">{ACTION_LABEL[a.action] ?? a.action}</p>
                    <p className="text-muted/70 text-[11px]">
                      {a.actor?.name ?? 'Elation'} · {formatDay(a.at)}
                      {a.action === 'user.revoke' && (a.after as { reason?: string } | null)?.reason ? ` · “${(a.after as { reason: string }).reason}”` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>
      )}
    </AdminPage>
  )
}
