import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Boxes,
  ImageIcon,
  MessageCircle,
  Sparkles,
  Wallet,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { api } from '@/lib/api'
import type { ActivityEntry } from '@/mocks/types'
import { useEvents } from '@/data/events'
import { cn } from '@/lib/utils'

const KIND_META: Record<
  ActivityEntry['kind'],
  { Icon: React.ComponentType<{ className?: string }>; className: string }
> = {
  moodboard: { Icon: ImageIcon, className: 'bg-accent/15 text-accent' },
  budget: { Icon: Wallet, className: 'bg-success/15 text-success' },
  note: { Icon: MessageCircle, className: 'bg-sage/20 text-sage-deep dark:text-sage' },
  system: { Icon: Sparkles, className: 'bg-warning/15 text-warning' },
  ar: { Icon: Boxes, className: 'bg-beige/40 text-tan dark:bg-tan/25 dark:text-beige' },
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

export function ActivityFeed() {
  const { data: events } = useEvents()
  const [allEntries, setEntries] = useState<ActivityEntry[] | null>(null)
  const mine = new Set((events ?? []).map((e) => e.id))
  const entries = allEntries && events ? allEntries.filter((a) => !a.eventId || mine.has(a.eventId)) : null

  useEffect(() => {
    let alive = true
    api.activity.list().then((rows) => {
      if (alive) setEntries(rows)
    })
    return () => {
      alive = false
    }
  }, [])

  return (
    <section className="border-border/10 bg-surface shadow-card rounded-3xl border p-6">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-display text-text text-xl">Latest from Elation</h2>
          <p className="text-muted/70 mt-0.5 text-xs">Every touch, in one thread.</p>
        </div>
        <Link
          to="/messages"
          className="text-accent hover:text-accent/80 text-xs font-semibold uppercase tracking-widest transition"
        >
          Open messages →
        </Link>
      </header>

      {!entries ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-shimmer rounded-2xl" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <p className="text-muted py-6 text-center text-sm">Nothing new yet — we'll ping you here.</p>
      ) : (
        <ol className="space-y-2">
          {entries.map((e, i) => {
            const { Icon, className } = KIND_META[e.kind]
            return (
              <motion.li
                key={e.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.04 * i, duration: 0.25 }}
                className="group flex items-start gap-3 rounded-2xl border border-transparent px-3 py-2.5 transition hover:border-border/10 hover:bg-surface-2"
              >
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                    className,
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-text truncate text-sm font-semibold">{e.title}</p>
                    <span className="text-muted/60 shrink-0 text-[11px]">{timeAgo(e.at)}</span>
                  </div>
                  {e.detail && (
                    <p className="text-muted mt-0.5 text-xs leading-relaxed">{e.detail}</p>
                  )}
                </div>
              </motion.li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
