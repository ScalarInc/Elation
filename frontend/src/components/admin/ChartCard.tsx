import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import type { ChartPoint } from '@/types/admin'

/** Small brand-styled bar chart card. Shows a quiet empty state when every value is 0. */
export function ChartCard({
  title,
  description,
  data,
  horizontal = false,
}: {
  title: string
  description?: string
  data: ChartPoint[]
  horizontal?: boolean
}) {
  const empty = data.every((p) => p.value === 0)
  const height = horizontal ? Math.max(180, data.length * 34) : 220

  return (
    <Card>
      <CardContent className="p-6">
        <h2 className="font-display text-text text-lg">{title}</h2>
        {description && <p className="text-muted/70 mt-0.5 text-xs">{description}</p>}
        <div className="mt-4" style={{ height }}>
          {empty ? (
            <div className="text-muted flex h-full items-center justify-center text-sm">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ left: horizontal ? 24 : 0, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border) / 0.15)" />
                {horizontal ? (
                  <>
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 11 }} />
                  </>
                ) : (
                  <>
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} width={28} tick={{ fontSize: 11 }} />
                  </>
                )}
                <Tooltip cursor={{ fill: 'rgb(var(--accent) / 0.08)' }} />
                <Bar dataKey="value" name="Count" fill="#D3A79F" radius={horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
