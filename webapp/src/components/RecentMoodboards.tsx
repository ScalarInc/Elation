import { Link } from 'react-router-dom'
import { ArrowRight, Heart } from 'lucide-react'
import { motion } from 'framer-motion'
import { useEvents } from '@/data/events'
import { useMoodboardLibrary } from '@/data/moodboards'

export function RecentMoodboards() {
  const { data: events = [] } = useEvents()
  const { data: boards = [] } = useMoodboardLibrary({ status: 'saved', limit: 4 })
  const eventById = new Map(events.map((e) => [e.id, e]))
  const mine = boards.filter((b) => eventById.has(b.eventId))

  if (mine.length === 0) return null

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.15 }}
      className="bg-cream-panel border-border/10 shadow-card rounded-3xl border p-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-text text-xl">Recent moodboards</h2>
          <p className="text-muted/70 mt-0.5 text-xs">Concepts Elation has drafted for you.</p>
        </div>
        <Link
          to="/moodboards"
          className="text-accent hover:text-accent/80 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-widest transition"
        >
          View all
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        {mine.map((b, i) => {
          const tag = eventById.get(b.eventId)?.type ?? b.tag
          return (
            <motion.div
              key={b.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i, duration: 0.3 }}
            >
              <Link
                to={`/events/${b.eventId}?tab=moodboard`}
                className="group relative block overflow-hidden rounded-2xl shadow-soft transition hover:-translate-y-0.5"
              >
                <img
                  src={b.cover ?? b.tiles[0]}
                  alt={b.title}
                  className="h-40 w-full object-cover transition duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent" />
                <span
                  className="bg-surface/90 absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full shadow-sm"
                  aria-label={b.liked ? 'Favourite' : 'Not favourite'}
                >
                  <Heart
                    className={
                      'h-3.5 w-3.5 ' +
                      (b.liked ? 'fill-accent text-accent' : 'text-muted/60')
                    }
                  />
                </span>
                <div className="absolute inset-x-3 bottom-2 text-white">
                  <p className="text-[9px] font-bold uppercase tracking-widest opacity-85">{tag}</p>
                  <p className="font-display text-base leading-tight drop-shadow">{b.title}</p>
                </div>
              </Link>
            </motion.div>
          )
        })}
      </div>
    </motion.section>
  )
}
