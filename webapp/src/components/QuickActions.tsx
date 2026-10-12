import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ClipboardList, Palette, Calculator, Boxes } from 'lucide-react'
import type { ClientEvent } from '@/mocks/types'

export function QuickActions({ event: e }: { event: ClientEvent }) {
  const actions: { title: string; body: string; icon: ReactNode; to: string }[] = [
    {
      title: 'Continue questionnaire',
      body: 'A few more answers, then we lock the concept.',
      icon: <ClipboardList className="h-5 w-5" />,
      to: `/events/${e.id}/questionnaire`,
    },
    {
      title: 'Open your moodboard',
      body: 'Latest concept refresh — take a look and leave a note.',
      icon: <Palette className="h-5 w-5" />,
      to: `/events/${e.id}?tab=moodboard`,
    },
    {
      title: 'Tune the budget',
      body: 'Line items, live totals and a traffic-light indicator.',
      icon: <Calculator className="h-5 w-5" />,
      to: `/events/${e.id}/budget`,
    },
    {
      title: 'Preview in AR',
      body: 'Walk your venue on Meta Quest 3 before it exists.',
      icon: <Boxes className="h-5 w-5" />,
      to: `/events/${e.id}/ar`,
    },
  ]

  return (
    <section>
      <h2 className="font-display text-text px-1 text-xl">Quick actions</h2>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {actions.map((a, i) => (
          <motion.div
            key={a.title}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i, duration: 0.3 }}
          >
            <Link
              to={a.to}
              className="bg-cream-panel border-border/10 shadow-card hover:shadow-soft hover:border-accent/25 group block rounded-2xl border p-5 text-left transition hover:-translate-y-0.5"
            >
              <span className="bg-accent/15 text-accent group-hover:bg-accent group-hover:text-accent-fg flex h-11 w-11 items-center justify-center rounded-xl transition">
                {a.icon}
              </span>
              <p className="text-text mt-4 text-sm font-semibold">{a.title}</p>
              <p className="text-muted mt-1 text-xs leading-snug">{a.body}</p>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
