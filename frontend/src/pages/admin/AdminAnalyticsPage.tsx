import { useEffect, useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { adminApi } from '@/api/admin'
import { ChartCard } from '@/components/admin/ChartCard'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import type { AdminAnalytics } from '@/types/admin'

export function AdminAnalyticsPage() {
  const [data, setData] = useState<AdminAnalytics | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    adminApi.analytics().then(
      (result) => !cancelled && setData(result),
      (err: Error) => !cancelled && setError(err.message),
    )
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-6 px-10 pb-12 pt-8">
      <header>
        <h1 className="font-display text-text text-3xl">Analytics</h1>
        <p className="text-muted/70 mt-1 text-sm">Client preferences, budgets and consultation trends.</p>
      </header>

      {error ? (
        <EmptyState icon={<BarChart3 className="h-6 w-6" />} title="Couldn't load analytics" description={error} />
      ) : !data ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-72 w-full" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ChartCard title="Events by type" data={data.eventsByType} horizontal />
          <ChartCard title="Budget ranges" description="Events by target budget (PKR)" data={data.budgetRanges} />
          <ChartCard title="Popular styles" description="Moods and styles across moodboards" data={data.popularStyles} horizontal />
          <ChartCard title="Moodboards per week" description="Last 8 weeks" data={data.moodboardsPerWeek} />
          <ChartCard title="Quote requests per week" description="Last 8 weeks" data={data.quotesPerWeek} />
          <ChartCard title="Quote requests by status" data={data.quotesByStatus} />
        </div>
      )}
    </div>
  )
}
