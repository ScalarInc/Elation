import { Link } from 'react-router-dom'
import { Boxes, CalendarDays, ClipboardList, ImageIcon, MessageCircle, RotateCw, Sparkles, Wallet } from 'lucide-react'
import { motion } from 'framer-motion'
import type { ActivityKindDto } from '@elation/shared/api'
import { Button } from '@/components/ui/button'
import { useActivity } from '@/data/chat'
import { cn } from '@/lib/utils'

const KIND_META: Record<ActivityKindDto, { Icon: React.ComponentType<{ className?: string }>; className: string }> = {
  moodboard: { Icon: ImageIcon, className: 'bg-accent/15 text-accent' },
  budget: { Icon: Wallet, className: 'bg-success/15 text-success' },
  note: { Icon: MessageCircle, className: 'bg-sage/20 text-sage-deep dark:text-sage' },
  system: { Icon: Sparkles, className: 'bg-warning/15 text-warning' },
  ar: { Icon: Boxes, className: 'bg-beige/40 text-tan dark:bg-tan/25 dark:text-beige' },
  questionnaire: { Icon: ClipboardList, className: 'bg-blush/30 text-blush-deep dark:text-blush' },
  event: { Icon: CalendarDays, className: 'bg-sage/20 text-sage-deep dark:text-sage' },
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

/** Live activity feed: the dashboard shows everything, an event page passes its `eventId`. */
export function ActivityFeed({
  eventId,
  title = 'Latest from Elation',
  subtitle = 'Every touch, in one thread.',
  limit = 8,
  messagesHref = '/messages',
}: {
  eventId?: string
  messagesHref?: string
  title?: string
  subtitle?: string
  limit?: number
}) {
  const query = useActivity(eventId, limit)
  const entries = query.data?.entries

  return (
    <section className="border-border/10 bg-surface shadow-card rounded-3xl border p-6">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-text text-xl">{title}</h2>
          <p className="text-muted/70 mt-0.5 text-xs">{subtitle}</p>
        </div>
        <Link
          to={messagesHref}
          className="text-accent hover:text-accent/80 shrink-0 text-xs font-semibold uppercase tracking-widest transition"
        >
          Open messages →
        </Link>
      </header>

      {query.isError ? (
        <div className="py-6 text-center">
          <p className="text-muted text-sm">Couldn’t load the latest updates.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void query.refetch()}>
            <RotateCw className="h-3.5 w-3.5" /> Try again
          </Button>
        </div>
      ) : !entries ? (
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
                transition={{ delay: Math.min(0.04 * i, 0.3), duration: 0.25 }}
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
