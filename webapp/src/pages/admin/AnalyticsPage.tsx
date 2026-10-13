import { useState } from 'react'
import { Download } from 'lucide-react'
import { ANALYTICS_REPORTS, type CountRow } from '@elation/shared/api'
import { AdminPage, LoadError, Panel, Rows } from '@/components/admin/kit'
import { inputClass } from '@/components/admin/format'
import { Button } from '@/components/ui/button'
import { useAnalytics, useTeam } from '@/data/admin'
import { useCurrentUser } from '@/data/auth'
import { cn } from '@/lib/utils'

const LIGHT: Record<string, string> = { green: 'On budget', yellow: 'Under budget', red: 'Over budget' }
const LIGHT_BAR: Record<string, string> = { green: 'bg-success', yellow: 'bg-warning', red: 'bg-danger' }

function Bars({ rows, empty = 'No data yet.', label = (r: CountRow) => r.label, bar }: { rows: CountRow[]; empty?: string; label?: (r: CountRow) => string; bar?: (r: CountRow) => string }) {
  if (rows.length === 0) return <p className="text-muted py-4 text-sm">{empty}</p>
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="text-sm">
          <div className="flex justify-between gap-2">
            <span className="text-text truncate">{label(r)}</span>
            <span className="text-muted tabular-nums">{r.value}</span>
          </div>
          <div className="bg-surface-2 mt-1 h-2 overflow-hidden rounded-full" aria-hidden>
            <div className={cn('h-full rounded-full', bar?.(r) ?? 'bg-accent')} style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function AnalyticsPage() {
  const me = useCurrentUser()
  const isAdmin = me.role === 'admin'
  const team = useTeam(isAdmin)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [consultantId, setConsultantId] = useState('')
  const q = { from: from || undefined, to: to || undefined, consultantId: consultantId || undefined }
  const [fresh, setFresh] = useState(0)
  const query = useAnalytics(fresh ? { ...q, fresh: 'true' as const } : q)
  const d = query.data
  const exportUrl = (report: string) => {
    const p = new URLSearchParams({ report, ...Object.fromEntries(Object.entries(q).filter(([, v]) => v)) as Record<string, string> })
    return `/api/v1/admin/analytics/export.csv?${p}`
  }

  const months = d ? [...new Set(d.eventTypes.map((e) => e.month))] : []

  return (
    <AdminPage
      title="Analytics"
      description="Client preferences, popular themes, budget ranges and consultation trends."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} className={cn(inputClass, 'w-auto')} />
          <span className="text-muted text-xs">to</span>
          <input type="date" aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} className={cn(inputClass, 'w-auto')} />
          <Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => setFresh((n) => n + 1)}>
            Refresh
          </Button>
          {isAdmin && (
            <select aria-label="Consultant" value={consultantId} onChange={(e) => setConsultantId(e.target.value)} className={cn(inputClass, 'w-auto')}>
              <option value="">All consultants</option>
              {(team.data ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
        </div>
      }
    >
      {query.isError ? (
        <LoadError onRetry={() => void query.refetch()} what="analytics" />
      ) : !d ? (
        <Rows n={8} />
      ) : (
        <div className={cn('grid gap-6 md:grid-cols-2', query.isFetching && 'opacity-70')}>
          <Panel title="Consultation funnel">
            <Bars rows={d.funnel} />
          </Panel>
          <Panel title="Budget health">
            <Bars rows={d.budgets.lights} label={(r) => LIGHT[r.label] ?? r.label} bar={(r) => LIGHT_BAR[r.label] ?? 'bg-accent'} empty="No budgets yet." />
          </Panel>
          <Panel title="Popular aesthetics (Q10)">
            <Bars rows={d.themes.aesthetics} />
          </Panel>
          <Panel title="Atmosphere (Q11)">
            <Bars rows={d.themes.atmospheres} />
          </Panel>
          <Panel title="Budget bands (Q121)">
            <Bars rows={d.budgets.bands} />
          </Panel>
          <Panel title="Budget targets">
            <Bars rows={d.budgets.targets} />
          </Panel>
          <Panel title="Adopted inspirations">
            <Bars rows={d.themes.adoptedInspirations} empty="No concept adopted yet." />
          </Panel>
          <Panel title="Lead concept moods">
            <Bars rows={d.themes.leadMoods} empty="No lead concepts yet." />
          </Panel>
          <Panel title="Events created, by month" className="md:col-span-2">
            {months.length === 0 ? (
              <p className="text-muted py-4 text-sm">No events in this period.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {months.map((m) => (
                  <div key={m}>
                    <p className="text-muted/70 mb-2 text-[10px] font-bold uppercase tracking-widest">
                      {new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(new Date(`${m}-15`))}
                    </p>
                    <Bars rows={d.eventTypes.filter((e) => e.month === m).map((e) => ({ label: e.type, value: e.value }))} />
                  </div>
                ))}
              </div>
            )}
          </Panel>
          <Panel title="Most-used inventory (tells Elation what to stock)" className="md:col-span-2">
            {d.inventory.length === 0 ? (
              <p className="text-muted py-4 text-sm">No pieces in saved moodboards or budgets yet.</p>
            ) : (
              <ul className="divide-border/10 divide-y text-sm">
                {d.inventory.map((i) => (
                  <li key={i.sku} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-text min-w-0 truncate">
                      {i.label} <span className="text-muted text-xs">{i.sku}</span>
                    </span>
                    <span className="text-muted shrink-0 text-xs tabular-nums">
                      {i.moodboards} moodboards · {i.budgets} budgets
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Export" className="md:col-span-2">
            <div className="flex flex-wrap gap-2">
              {ANALYTICS_REPORTS.map((r) => (
                <Button key={r} asChild variant="outline" size="sm">
                  <a href={exportUrl(r)} download>
                    <Download className="h-3.5 w-3.5" /> {r.replace('-', ' ')}.csv
                  </a>
                </Button>
              ))}
            </div>
          </Panel>
        </div>
      )}
    </AdminPage>
  )
}
