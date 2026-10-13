import { useState } from 'react'
import { Link } from 'react-router-dom'
import { UserPlus } from 'lucide-react'
import { INQUIRY_STATUSES, type InquiryDto } from '@elation/shared/api'
import { AdminPage, LoadError, Panel, Rows } from '@/components/admin/kit'
import { copy, formatDay, inputClass, timeAgo } from '@/components/admin/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { adminApi, useAdminMutation, useInquiries } from '@/data/admin'
import { isApiError } from '@/lib/api/client'
import { cn } from '@/lib/utils'

const VARIANT: Record<InquiryDto['status'], 'warning' | 'accent' | 'success' | 'outline'> = { new: 'warning', contacted: 'accent', converted: 'success', closed: 'outline' }

export function InquiriesPage() {
  const [status, setStatus] = useState('new')
  const query = useInquiries(status || undefined)
  const update = useAdminMutation((v: { id: string; status: 'new' | 'contacted' | 'closed' }) => adminApi.updateInquiry(v.id, v.status))
  const convert = useAdminMutation((id: string) => adminApi.convertInquiry(id, {}))
  const fail = (err: unknown) => toast.error(isApiError(err) ? err.message : 'That didn’t work')

  return (
    <AdminPage title="Inquiries" description="“Book a consultation” requests from the public site. Convert one to invite the person as a client.">
      <Panel
        actions={
          <select aria-label="Status" className={cn(inputClass, 'w-auto')} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {INQUIRY_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        }
      >
        {query.isError ? (
          <LoadError onRetry={() => void query.refetch()} what="inquiries" />
        ) : query.isPending ? (
          <Rows />
        ) : query.data.length === 0 ? (
          <p className="text-muted py-10 text-center text-sm">No {status} inquiries.</p>
        ) : (
          <ul className="divide-border/10 divide-y">
            {query.data.map((i) => (
              <li key={i.id} className="flex flex-wrap items-start gap-4 py-4">
                <div className="min-w-[220px] flex-1">
                  <p className="text-text font-semibold">
                    {i.name} <Badge variant={VARIANT[i.status]}>{i.status}</Badge>
                  </p>
                  <p className="text-muted text-xs">
                    <a href={`mailto:${i.email}`} className="hover:underline">
                      {i.email}
                    </a>
                    {i.phone && ` · ${i.phone}`} · {timeAgo(i.createdAt)}
                  </p>
                  <p className="text-muted mt-1 text-xs">
                    {[i.eventType, i.eventDate && formatDay(i.eventDate), i.guestRange && `${i.guestRange} guests`, i.city, i.budgetBand].filter(Boolean).join(' · ') || 'No event details'}
                  </p>
                  {i.message && <p className="text-text mt-2 whitespace-pre-wrap text-sm">“{i.message}”</p>}
                  {i.source && <p className="text-muted/70 mt-1 text-[11px]">Heard about us: {i.source}</p>}
                </div>
                <div className="flex flex-wrap gap-1">
                  {i.status === 'converted' && i.convertedUserId ? (
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/admin/clients/${i.convertedUserId}`}>Open client</Link>
                    </Button>
                  ) : (
                    <>
                      {i.status === 'new' && (
                        <Button size="sm" variant="outline" disabled={update.isPending} onClick={() => update.mutate({ id: i.id, status: 'contacted' }, { onError: fail })}>
                          Mark contacted
                        </Button>
                      )}
                      <Button
                        size="sm"
                        disabled={convert.isPending}
                        onClick={() =>
                          convert.mutate(i.id, {
                            onSuccess: (r) =>
                              toast.success(`${i.name} was invited`, {
                                description: 'They got an email with their activation link.',
                                action: { label: 'Copy link', onClick: () => void copy(r.activationUrl) },
                              }),
                            onError: fail,
                          })
                        }
                      >
                        <UserPlus className="h-3.5 w-3.5" /> Invite as client
                      </Button>
                      {i.status !== 'closed' && (
                        <Button size="sm" variant="ghost" disabled={update.isPending} onClick={() => update.mutate({ id: i.id, status: 'closed' }, { onError: fail })}>
                          Close
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </AdminPage>
  )
}
