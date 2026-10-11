import { Sparkles } from 'lucide-react'
import { motion } from 'framer-motion'
import { CountdownCard } from '@/components/dashboard/CountdownCard'
import { ProgressOverview } from '@/components/dashboard/ProgressOverview'
import { NextStepCard } from '@/components/dashboard/NextStepCard'
import { RecentMoodboards } from '@/components/dashboard/RecentMoodboards'
import { QuickActions } from '@/components/dashboard/QuickActions'
import { ActivityFeed } from '@/components/dashboard/ActivityFeed'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useResolvedEvents } from '@/hooks/useResolvedEvent'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export function DashboardPage() {
  const user = useCurrentUser()
  const events = useResolvedEvents()
  const event = events[0]
  const firstName = user?.name.split(' ')[0]

  return (
    <div className="pb-16">
      <motion.header
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="px-6 pt-8 md:px-10"
      >
        <p className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">
          {greeting()}
        </p>
        <h1 className="font-display text-text mt-1 flex items-center gap-3 text-4xl leading-tight">
          Welcome back{firstName ? `, ${firstName}` : ''}
          <Sparkles className="text-accent h-6 w-6" />
        </h1>
        <p className="text-muted mt-2 max-w-lg text-sm">
          Here's where your event planning stands.
        </p>
      </motion.header>

      <div className="mt-6 space-y-6 px-6 md:px-10">
        {event && <CountdownCard event={event} />}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ProgressOverview event={event} />
          </div>
          <NextStepCard event={event} />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <RecentMoodboards />
          </div>
          <ActivityFeed />
        </div>

        <QuickActions event={event} />
      </div>
    </div>
  )
}
