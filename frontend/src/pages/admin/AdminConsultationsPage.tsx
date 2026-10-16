import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ClipboardList, Search } from 'lucide-react'
import { adminApi } from '@/api/admin'
import { ClientNotes } from '@/components/admin/ClientNotes'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/toast'
import { BUDGET_STATUS_LABEL } from '@/lib/budget'
import { formatBudget, formatDate, formatPKR } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { BudgetStatus, ModuleStatus } from '@/types'
import type { Consultation, ConsultationQuote, QuoteStatus } from '@/types/admin'

const MODULES = ['questionnaire', 'moodboard', 'budget'] as const
const STEP_STYLE: Record<ModuleStatus, string> = {
  complete: 'bg-success/20 text-success',
  in_progress: 'bg-accent/20 text-accent',
  pending: 'bg-surface-2 text-muted',
}
const QUOTE_STATUSES: QuoteStatus[] = ['new', 'contacted', 'closed']

export function AdminConsultationsPage() {
  const [rows, setRows] = useState<Consultation[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    try {
      setRows(await adminApi.consultations.list())
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function setQuoteStatus(quote: ConsultationQuote, status: QuoteStatus) {
    try {
      const saved = await adminApi.consultations.setQuoteStatus(quote.id, status)
      setRows((prev) => (prev ?? []).map((r) => ({ ...r, quotes: r.quotes.map((q) => (q.id === saved.id ? saved : q)) })))
    } catch (err) {
      toast.error("Couldn't update the quote", { description: (err as Error).message })
    }
  }

  const q = search.trim().toLowerCase()
  const visible = (rows ?? []).filter((r) => !q || r.clientName.toLowerCase().includes(q) || r.clientEmail.toLowerCase().includes(q))

  return (
    <div className="px-10 pb-12 pt-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-text text-3xl">Consultations</h1>
          <p className="text-muted/70 mt-1 text-sm">Each client's progress, quote requests and follow-ups.</p>
        </div>
        <label className="border-border/10 bg-surface flex w-72 items-center gap-2 rounded-xl border px-3 py-2">
          <Search className="text-muted/60 h-4 w-4" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search clients"
            className="text-text placeholder:text-muted/50 w-full bg-transparent text-sm outline-none" />
        </label>
      </header>

      {error ? (
        <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="Couldn't load consultations" description={error}
          action={<Button onClick={() => void load()}>Try again</Button>} />
      ) : rows === null ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : visible.length === 0 ? (
        <EmptyState icon={<ClipboardList className="h-6 w-6" />} title={rows.length ? 'No clients match' : 'No clients yet'}
          description={rows.length ? 'Try a different search.' : 'Invite a client from the Clients page to get started.'} />
      ) : (
        <div className="space-y-3">
          {visible.map((r) => {
            const expanded = open === r.clientId
            const openQuotes = r.quotes.filter((x) => x.status !== 'closed').length
            return (
              <Card key={r.clientId}>
                <CardContent className="p-0">
                  <button type="button" onClick={() => setOpen(expanded ? null : r.clientId)}
                    className="flex w-full items-center gap-4 px-5 py-4 text-left" aria-expanded={expanded}>
                    <div className="min-w-0 flex-1">
                      <p className="text-text font-semibold">{r.clientName}</p>
                      <p className="text-muted/70 text-xs">
                        {r.clientEmail} · {r.consultantName ?? 'No consultant'} · access until {formatDate(r.accessExpiresAt)}
                      </p>
                    </div>
                    <div className="hidden gap-2 md:flex">
                      <Badge variant="outline">{r.events.length} event{r.events.length === 1 ? '' : 's'}</Badge>
                      {openQuotes > 0 && <Badge variant="accent">{openQuotes} open quote{openQuotes === 1 ? '' : 's'}</Badge>}
                      {r.openFollowUps > 0 && <Badge variant="warning">{r.openFollowUps} follow-up{r.openFollowUps === 1 ? '' : 's'}</Badge>}
                      {r.status !== 'active' && <Badge variant="outline">{r.status}</Badge>}
                    </div>
                    <ChevronDown className={cn('text-muted h-4 w-4 transition', expanded && 'rotate-180')} />
                  </button>

                  {expanded && (
                    <div className="border-border/10 grid grid-cols-1 gap-6 border-t p-5 lg:grid-cols-2">
                      <div className="space-y-5">
                        <div>
                          <p className="text-muted/70 mb-2 text-[10px] font-bold uppercase tracking-widest">Events</p>
                          {r.events.length === 0 ? (
                            <p className="text-muted text-xs">No events created yet.</p>
                          ) : (
                            <ul className="space-y-2">
                              {r.events.map((e) => (
                                <li key={e.id} className="border-border/10 rounded-xl border p-3 text-sm">
                                  <p className="text-text font-semibold">{e.name} <span className="text-muted font-normal">· {e.type}</span></p>
                                  <p className="text-muted/70 text-xs">{formatDate(e.date)} · {e.guests} guests · {formatBudget(e.budgetPkr)}</p>
                                  <div className="mt-2 flex gap-1.5">
                                    {MODULES.map((m) => (
                                      <span key={m} className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest', STEP_STYLE[e.progress[m]])}>
                                        {m}
                                      </span>
                                    ))}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div>
                          <p className="text-muted/70 mb-2 text-[10px] font-bold uppercase tracking-widest">Quote requests</p>
                          {r.quotes.length === 0 ? (
                            <p className="text-muted text-xs">No quote requests yet.</p>
                          ) : (
                            <ul className="space-y-2">
                              {r.quotes.map((quote) => (
                                <li key={quote.id} className="border-border/10 flex items-center gap-3 rounded-xl border p-3 text-sm">
                                  <div className="min-w-0 flex-1">
                                    <p className="text-text font-semibold">{formatPKR(quote.totalPkr)} <span className="text-muted font-normal">· {quote.eventName}</span></p>
                                    <p className="text-muted/70 text-xs">
                                      {quote.itemCount} items · {BUDGET_STATUS_LABEL[quote.budgetStatus as BudgetStatus] ?? quote.budgetStatus} · {formatDate(quote.createdAt)}
                                    </p>
                                    {quote.clientNote && <p className="text-muted mt-1 text-xs italic">"{quote.clientNote}"</p>}
                                  </div>
                                  <select value={quote.status} onChange={(e) => void setQuoteStatus(quote, e.target.value as QuoteStatus)}
                                    aria-label="Quote status"
                                    className="border-border/15 bg-surface text-text h-8 rounded-lg border px-2 text-xs outline-none">
                                    {QUOTE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                      <ClientNotes clientId={r.clientId} onChange={() => void load()} />
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
