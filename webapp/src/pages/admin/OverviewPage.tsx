import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, CheckCircle2 } from 'lucide-react'
import { AdminPage, LoadError, Panel, Rows, Stat } from '@/components/admin/kit'
import { formatDay, timeAgo } from '@/components/admin/format'
import { formatPKRCompact } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { adminApi, useAdminMutation, useOverview } from '@/data/admin'
import { useCurrentUser } from '@/data/auth'

export function OverviewPage() {
  const me = useCurrentUser()
  const query = useOverview()
  const done = useAdminMutation((id: string) => adminApi.updateNote(id, { done: true }))
  const d = query.data
  const [today] = useState(() => new Date().toISOString().slice(0, 10))

  return (
    <AdminPage title={`Good to see you, ${me.name.split(' ')[0]}`} description={me.role === 'admin' ? 'Everything across Elation today.' : 'Your clients today.'}>
      {query.isError ? (
        <LoadError onRetry={() => void query.refetch()} what="the overview" />
      ) : !d ? (
        <Rows n={6} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
            <Stat label="Active clients" value={d.kpis.activeClients} />
            <Stat label="Invited" value={d.kpis.invitedClients} hint="not activated yet" />
            <Stat label="Consultations" value={d.kpis.consultationsThisWeek} hint="this week" />
            <Stat label="Moodboards" value={d.kpis.moodboardsGenerated} hint="curated" />
            <Stat label="Avg. target" value={d.kpis.averageTargetBudgetPkr ? formatPKRCompact(d.kpis.averageTargetBudgetPkr) : '—'} />
            <Stat label="Open quotes" value={<Link to="/admin/quotes" className="hover:text-accent">{d.kpis.openQuotes}</Link>} />
            <Stat label="New inquiries" value={<Link to="/admin/inquiries" className="hover:text-accent">{d.kpis.newInquiries}</Link>} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Follow-ups this week">
              {d.followUps.length === 0 ? (
                <p className="text-muted py-6 text-center text-sm">Nothing due — notes with a follow-up date appear here.</p>
              ) : (
                <ul className="space-y-2">
                  {d.followUps.map((n) => (
                    <li key={n.id} className="bg-surface-2 flex items-start gap-3 rounded-2xl px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-text text-sm">
                          <Link to={`/admin/clients/${n.clientId}`} className="font-semibold hover:underline">
                            {n.clientName}
                          </Link>{' '}
                          · <span className={n.followUpAt && n.followUpAt < today ? 'text-danger' : 'text-muted'}>{formatDay(n.followUpAt)}</span>
                        </p>
                        <p className="text-muted mt-0.5 line-clamp-2 text-xs">{n.body}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={done.isPending}
                        onClick={() => done.mutate(n.id, { onError: () => toast.error('Couldn’t update the note') })}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Done
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Events in the next 30 days">
              {d.upcomingEvents.length === 0 ? (
                <p className="text-muted py-6 text-center text-sm">No events in the next 30 days.</p>
              ) : (
                <ul className="space-y-2">
                  {d.upcomingEvents.map((e) => (
                    <li key={e.id} className="flex items-center gap-3 rounded-2xl px-2 py-2">
                      <span className="bg-accent/15 text-accent flex h-9 w-9 items-center justify-center rounded-xl">
                        <CalendarDays className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-text truncate text-sm font-semibold">{e.name}</p>
                        <p className="text-muted text-xs">
                          {e.type} ·{' '}
                          <Link to={`/admin/clients/${e.clientId}`} className="hover:underline">
                            {e.clientName}
                          </Link>
                        </p>
                      </div>
                      <span className="text-muted text-xs">{formatDay(e.date)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <Panel title="Recent client activity">
            {d.recentActivity.length === 0 ? (
              <p className="text-muted py-6 text-center text-sm">No activity yet.</p>
            ) : (
              <ul className="divide-border/10 divide-y">
                {d.recentActivity.map((a) => (
                  <li key={a.id} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                    <span className="min-w-0 truncate">
                      <Link to={`/admin/clients/${a.clientId}`} className="text-text font-semibold hover:underline">
                        {a.clientName}
                      </Link>{' '}
                      <span className="text-muted">— {a.title}</span>
                    </span>
                    <span className="text-muted/70 shrink-0 text-xs">{timeAgo(a.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}
    </AdminPage>
  )
}
