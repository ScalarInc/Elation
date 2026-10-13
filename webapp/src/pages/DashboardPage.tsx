import { CalendarPlus, Sparkles } from 'lucide-react'
import { motion } from 'framer-motion'
import { CountdownCard } from '@/components/CountdownCard'
import { ProgressOverview } from '@/components/ProgressOverview'
import { NextStepCard } from '@/components/NextStepCard'
import { RecentMoodboards } from '@/components/RecentMoodboards'
import { QuickActions } from '@/components/QuickActions'
import { ActivityFeed } from '@/components/ActivityFeed'
import { useCurrentUser } from '@/data/auth'
import { pickPrimaryEvent } from '@/data/events'
import { useEventsView } from '@/data/events'
import { NewEventDialog } from '@/components/NewEventDialog'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadError } from '@/components/ui/load-error'
import type { ClientEvent } from '@/mocks/types'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function subtitle(event: ClientEvent | undefined) {
  if (!event) return 'Your private Elation studio. Start with your first event and Elation curates the rest.'
  const name = event.concept ?? event.name
  if (event.status === 'past') return `${name} is behind you — we hope it was everything you imagined.`
  return `${name} · ${event.nextStep.title.toLowerCase()} is next.`
}

export function DashboardPage() {
  const firstName = useCurrentUser().name.split(' ')[0]
  const { events, isPending, isError, refetch } = useEventsView()
  // A failed background refetch keeps the cached events on screen.
  const failed = isError && events.length === 0
  const event = pickPrimaryEvent(events)

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
          Welcome back, {firstName}
          <Sparkles className="text-accent h-6 w-6" />
        </h1>
        <p className="text-muted mt-2 max-w-lg text-sm">
          {isPending || failed ? '\u00a0' : subtitle(event)}
        </p>
      </motion.header>

      <div className="mt-6 space-y-6 px-6 md:px-10">
        {isPending ? (
          <>
            <Skeleton className="h-40 w-full rounded-3xl" />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <Skeleton className="h-64 w-full rounded-3xl lg:col-span-2" />
              <Skeleton className="h-64 w-full rounded-3xl" />
            </div>
          </>
        ) : failed ? (
          <LoadError what="your events" onRetry={() => void refetch()} />
        ) : !event ? (
          <EmptyState
            icon={<CalendarPlus className="h-6 w-6" />}
            title="Let’s plan your first event"
            description="Tell us the basics — type, date, venue, guests — and Elation will curate a concept, budget and AR walkthrough around it."
            action={<NewEventDialog />}
          />
        ) : (
          <>
            <CountdownCard event={event} />

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
          </>
        )}
      </div>
    </div>
  )
}
