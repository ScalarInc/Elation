import { useEffect, useState } from 'react'
import { ArrowRight, CalendarClock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import type { ClientEvent } from '@/mocks/types'
import { formatDate } from '@/lib/format'

function useCountdown(iso: string) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])
  const diff = new Date(iso).getTime() - now
  const days = Math.max(0, Math.floor(diff / 86_400_000))
  const hours = Math.max(0, Math.floor((diff % 86_400_000) / 3_600_000))
  const minutes = Math.max(0, Math.floor((diff % 3_600_000) / 60_000))
  return { days, hours, minutes, past: diff < 0 }
}

export function CountdownCard({ event }: { event: ClientEvent }) {
  const { days, hours, minutes, past } = useCountdown(event.date)

  const units = [
    { value: days, label: 'DAYS' },
    { value: hours, label: 'HOURS' },
    { value: minutes, label: 'MINUTES' },
  ]

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-3xl border border-border/10 bg-gradient-to-br from-accent/15 via-surface to-surface-2 p-6 shadow-card"
    >
      <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />
      <div className="absolute -bottom-24 -left-12 h-56 w-56 rounded-full bg-sage/10 blur-3xl" />

      <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">
            The countdown
          </p>
          <div className="mt-1 flex items-baseline gap-3">
            <h2 className="font-display text-text text-2xl md:text-3xl">
              {event.concept ?? event.name}
            </h2>
            <span className="bg-accent/15 text-accent hidden rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest md:inline-flex">
              {event.type}
            </span>
          </div>
          <p className="text-muted mt-1.5 flex items-center gap-1.5 text-xs">
            <CalendarClock className="h-3.5 w-3.5" />
            {formatDate(event.date)} · {event.venue.name}
          </p>
        </div>

        <div className="flex items-center gap-4">
          {past ? (
            <span className="font-display text-2xl italic text-muted">A memory now.</span>
          ) : (
            units.map(({ value, label }) => (
              <div
                key={label}
                className="flex min-w-[68px] flex-col items-center rounded-2xl border border-border/10 bg-surface/60 px-4 py-3 backdrop-blur"
              >
                <span className="font-display text-text text-3xl tabular-nums">
                  {String(value).padStart(2, '0')}
                </span>
                <span className="text-muted/70 mt-0.5 text-[9px] font-bold tracking-widest">
                  {label}
                </span>
              </div>
            ))
          )}
        </div>

        <Link
          to={`/events/${event.id}`}
          className="bg-accent text-accent-fg inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-widest shadow-sm transition hover:brightness-95"
        >
          Open event
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </motion.section>
  )
}
