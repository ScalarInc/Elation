import { useState } from 'react'
import { Link } from 'react-router-dom'
import { QUOTE_STATUSES, type AdminQuoteDto } from '@elation/shared/api'
import { AdminPage, LoadError, Panel, Rows, Table } from '@/components/admin/kit'
import { formatDay, formatPkr, inputClass, timeAgo } from '@/components/admin/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast'
import { adminApi, useAdminMutation, useAdminQuotes } from '@/data/admin'
import { isApiError } from '@/lib/api/client'
import { cn } from '@/lib/utils'

const LABEL: Record<AdminQuoteDto['status'], string> = { open: 'Open', in_review: 'In review', quoted: 'Quoted', closed: 'Closed' }
const VARIANT: Record<AdminQuoteDto['status'], 'warning' | 'accent' | 'success' | 'outline'> = { open: 'warning', in_review: 'accent', quoted: 'success', closed: 'outline' }

export function QuotesPage() {
  const [status, setStatus] = useState<string>('open')
  const query = useAdminQuotes(status || undefined)
  const update = useAdminMutation((v: { id: string; status: string; message?: string }) => adminApi.updateQuote(v.id, v))
  const [quoting, setQuoting] = useState<AdminQuoteDto | null>(null)
  const [message, setMessage] = useState('')
  const fail = (err: unknown) => toast.error(isApiError(err) ? err.message : 'That didn’t work')

  return (
    <AdminPage title="Quotes" description="Quote requests from clients' budgets. Marking one quoted tells the client by message and email.">
      <Panel
        actions={
          <select aria-label="Status" className={cn(inputClass, 'w-auto')} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {QUOTE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LABEL[s]}
              </option>
            ))}
          </select>
        }
      >
        {query.isError ? (
          <LoadError onRetry={() => void query.refetch()} what="quotes" />
        ) : query.isPending ? (
          <Rows />
        ) : query.data.length === 0 ? (
          <p className="text-muted py-10 text-center text-sm">No {status ? LABEL[status as AdminQuoteDto['status']].toLowerCase() : ''} quotes.</p>
        ) : (
          <Table head={['Client · event', 'Estimate', 'Pieces', 'Requested', 'Status', '']}>
            {query.data.map((q) => (
              <tr key={q.id}>
                <td className="px-3 py-3">
                  <Link to={`/admin/clients/${q.client.id}`} className="text-text font-semibold hover:underline">
                    {q.client.name}
                  </Link>
                  <p className="text-muted text-xs">
                    {q.event.name} · {q.event.type} · {formatDay(q.event.date)}
                  </p>
                  {q.note && <p className="text-muted mt-1 text-xs italic">“{q.note}”</p>}
                </td>
                <td className="px-3 py-3">
                  <p className="text-text">{formatPkr(q.totalPkr)}</p>
                  <p className="text-muted text-xs">target {formatPkr(q.targetPkr)}</p>
                </td>
                <td className="text-muted px-3 py-3">{q.lineCount}</td>
                <td className="text-muted px-3 py-3">{timeAgo(q.createdAt)}</td>
                <td className="px-3 py-3">
                  <Badge variant={VARIANT[q.status]}>{LABEL[q.status]}</Badge>
                  {q.handledBy && <p className="text-muted/70 mt-1 text-[10px]">{q.handledBy.name}</p>}
                </td>
                <td className="px-3 py-3">
                  <div className="flex justify-end gap-1">
                    {q.status === 'open' && (
                      <Button size="sm" variant="outline" disabled={update.isPending} onClick={() => update.mutate({ id: q.id, status: 'in_review' }, { onError: fail })}>
                        Start review
                      </Button>
                    )}
                    {(q.status === 'open' || q.status === 'in_review') && (
                      <Button size="sm" onClick={() => (setQuoting(q), setMessage(''))}>
                        Mark quoted
                      </Button>
                    )}
                    {q.status !== 'closed' && (
                      <Button size="sm" variant="ghost" disabled={update.isPending} onClick={() => update.mutate({ id: q.id, status: 'closed' }, { onError: fail })}>
                        Close
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <Dialog open={Boolean(quoting)} onOpenChange={(v) => !v && setQuoting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send the quote</DialogTitle>
            <DialogDescription>
              {quoting?.client.name} will get a message and an email that their quote for {quoting?.event.name} ({formatPkr(quoting?.totalPkr)}) is ready.
            </DialogDescription>
          </DialogHeader>
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="Optional note for the client (e.g. what's included)" aria-label="Note for the client" />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setQuoting(null)}>
              Cancel
            </Button>
            <Button
              disabled={update.isPending}
              onClick={() =>
                update.mutate(
                  { id: quoting!.id, status: 'quoted', message: message.trim() || undefined },
                  { onSuccess: () => (setQuoting(null), toast.success('Quote sent to the client')), onError: fail },
                )
              }
            >
              Send quote
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminPage>
  )
}
