import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BellRing, CalendarDays, ClipboardCheck, Hourglass, Image as ImageIcon, MailPlus, Users } from 'lucide-react'
import { adminApi } from '@/api/admin'
import { ChartCard } from '@/components/admin/ChartCard'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/format'
import type { ActivityEntry } from '@/types'
import type { AdminAnalytics, AdminOverview } from '@/types/admin'

type Data = { overview: AdminOverview; analytics: AdminAnalytics; activity: ActivityEntry[] }

export function AdminOverviewPage() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([adminApi.overview(), adminApi.analytics(), adminApi.activity()]).then(
      ([overview, analytics, activity]) => !cancelled && setData({ overview, analytics, activity }),
      (err: Error) => !cancelled && setError(err.message),
    )
    return () => {
      cancelled = true
    }
  }, [])

  if (error) return <div className="px-10 pt-8"><EmptyState icon={<Users className="h-6 w-6" />} title="Couldn't load the overview" description={error} /></div>

  const o = data?.overview
  const kpis = [
    { label: 'Active clients', value: o?.activeClients, icon: Users, to: '/admin/clients' },
    { label: 'Invites pending', value: o?.pendingInvites, icon: MailPlus, to: '/admin/clients' },
    { label: 'Access ending in 7 days', value: o?.expiringSoon, icon: Hourglass, to: '/admin/clients' },
    { label: 'Events', value: o?.events, icon: CalendarDays, to: '/admin/consultations' },
    { label: 'Moodboards this week', value: o?.moodboardsThisWeek, icon: ImageIcon, to: '/admin/analytics' },
    { label: 'Open quote requests', value: o?.openQuotes, icon: ClipboardCheck, to: '/admin/consultations' },
    { label: 'Follow-ups due', value: o?.followUpsDue, icon: BellRing, to: '/admin/consultations' },
  ]

  return (
    <div className="space-y-6 px-10 pb-12 pt-8">
      <header>
        <h1 className="font-display text-text text-3xl">Overview</h1>
        <p className="text-muted/70 mt-1 text-sm">Where every client stands, at a glance.</p>
      </header>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
        {kpis.map(({ label, value, icon: Icon, to }) => (
          <Link key={label} to={to} className="border-border/10 bg-surface hover:border-accent/30 rounded-2xl border p-4 transition">
            <Icon className="text-accent h-4 w-4" />
            {value === undefined ? <Skeleton className="mt-3 h-7 w-12" /> : <p className="font-display text-text mt-2 text-3xl">{value}</p>}
            <p className="text-muted/80 mt-1 text-xs">{label}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {data ? (
            <>
              <ChartCard title="Budget ranges" description="Events by target budget (PKR)" data={data.analytics.budgetRanges} />
              <ChartCard title="Popular styles" description="From generated and adopted moodboards" data={data.analytics.popularStyles} horizontal />
            </>
          ) : (
            <Skeleton className="h-96 w-full" />
          )}
        </div>
        <Card>
          <CardContent className="p-6">
            <h2 className="font-display text-text text-lg">Recent activity</h2>
            {!data ? (
              <Skeleton className="mt-4 h-40 w-full" />
            ) : data.activity.length === 0 ? (
              <p className="text-muted mt-4 text-sm">Nothing yet. Activity appears as clients plan.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {data.activity.map((a) => (
                  <li key={a.id} className="text-sm">
                    <p className="text-text font-semibold">{a.title}</p>
                    {a.detail && <p className="text-muted truncate text-xs">{a.detail}</p>}
                    <p className="text-muted/60 text-[11px]">{formatDate(a.at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
