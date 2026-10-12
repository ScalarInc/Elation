import { Skeleton } from '@/components/ui/skeleton'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Sparkles } from 'lucide-react'
import type { EventType } from '@elation/shared/domain'
import { useArSets, useEventAr } from '@/data/ar'
import { useEventView } from '@/data/events'
import { ARSetCard, ARStatusPill } from '@/components/ARSetCard'
import { ARAssetList } from '@/components/ARAssetList'
import { ARHero } from '@/components/ARHero'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { formatDate } from '@/lib/format'

const WEDDING_SET_TYPES: EventType[] = ['Baraat', 'Walima', 'Mehndi']

function ARNotFound() {
  return (
    <div className="px-10 pb-12 pt-8">
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <h1 className="font-display text-2xl">Event not found</h1>
          <p className="text-muted/70 text-sm">
            The event you're looking for doesn't exist or was archived.
          </p>
          <Button asChild variant="outline">
            <Link to="/events">
              <ArrowLeft className="h-4 w-4" />
              Back to My Events
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function PageSkeleton() {
  return (
    <div className="space-y-6 px-10 pb-12 pt-8">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-56 w-full rounded-3xl" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Skeleton className="h-48 w-full rounded-3xl lg:col-span-2" />
        <Skeleton className="h-48 w-full rounded-3xl" />
      </div>
    </div>
  )
}

export function EventARPage() {
  const { id } = useParams<{ id: string }>()
  const { event, isPending } = useEventView(id)
  const eventAr = useEventAr(id)
  const { data: allSets = [] } = useArSets()
  const set = eventAr.isPending ? undefined : (eventAr.data?.set ?? null)
  const showcase = eventAr.data?.showcase ?? null
  const siblings = allSets.filter((s) => s.eventId !== id)

  if (isPending) return <PageSkeleton />
  if (!event) return <ARNotFound />
  if (eventAr.isError) {
    return (
      <div className="px-10 pb-12 pt-8">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="font-display text-text text-xl">We couldn't load this AR set</p>
            <p className="text-muted text-sm">{eventAr.error.message}</p>
            <Button variant="outline" onClick={() => void eventAr.refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-8 px-10 pb-16 pt-8">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Link
          to={`/events/${event.id}`}
          className="text-muted hover:text-text inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to {event.concept ?? event.name}
        </Link>
      </motion.div>

      <ARHero
        image={event.coverImage}
        kicker={`AR PREVIEW · ${event.type.toUpperCase()}`}
        title={`Walk your ${event.type} before it exists.`}
        subhead={`Elation is building an AR passthrough set for ${event.concept ?? event.name}. Preview it on Meta Quest 3 before we start building on-site.`}
        eventId={event.id}
      />

      <section>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="mb-4 flex flex-wrap items-end justify-between gap-3"
        >
          <div>
            <p className="text-muted/70 text-[10px] font-bold uppercase tracking-[0.3em]">
              THIS EVENT
            </p>
            <h2 className="font-display text-text mt-1 text-2xl">
              {event.type} set · {formatDate(event.date)}
            </h2>
            <p className="text-muted mt-1 text-sm">
              The AR walkthrough Elation is preparing for {event.concept ?? event.name}.
            </p>
          </div>
          {set && <ARStatusPill status={set.status} />}
        </motion.div>

        {set === undefined ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : set === null ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <span className="bg-accent/15 text-accent flex h-14 w-14 items-center justify-center rounded-2xl">
                <Sparkles className="h-6 w-6" />
              </span>
              <p className="font-display text-text text-xl">No AR set yet</p>
              <p className="text-muted max-w-md text-sm">
                Elation drafts the AR walkthrough once your questionnaire and moodboard are far
                enough along. Your consultant will notify you when it's ready.
              </p>
              <Button asChild variant="outline">
                <Link to={`/events/${event.id}?tab=questionnaire`}>Continue questionnaire</Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}
        {set === null && showcase && (
          <div className="mt-6">
            <p className="text-muted/70 mb-3 text-[10px] font-bold uppercase tracking-[0.3em]">MEANWHILE — ELATION'S SHOWCASE {event.type.toUpperCase()} SET</p>
            <ARSetCard set={showcase} />
          </div>
        )}
        {set ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
            <ARSetCard set={set} featured />
            <Card>
              <CardContent className="flex h-full flex-col gap-5 p-6 lg:p-7">
                <div>
                  <p className="text-muted/70 text-[10px] font-bold uppercase tracking-[0.3em]">
                    WHAT TO EXPECT
                  </p>
                  <h3 className="font-display text-text mt-1 text-xl">Your session</h3>
                </div>
                <ul className="text-muted space-y-3 text-sm leading-relaxed">
                  <li className="flex gap-3">
                    <span className="text-accent font-display shrink-0">01</span>
                    Your consultant delivers a Meta Quest 3 to your home or office.
                  </li>
                  <li className="flex gap-3">
                    <span className="text-accent font-display shrink-0">02</span>
                    They calibrate the passthrough overlay to your seated view.
                  </li>
                  <li className="flex gap-3">
                    <span className="text-accent font-display shrink-0">03</span>
                    Walk through the {event.type} set, note changes, and approve.
                  </li>
                  <li className="flex gap-3">
                    <span className="text-accent font-display shrink-0">04</span>
                    Elation locks the layout and begins on-site build.
                  </li>
                </ul>
                <div className="border-border/10 text-muted mt-auto rounded-2xl border p-4 text-xs leading-relaxed">
                  Note: AR passthrough — you'll see the real room with the decor layered in.
                  Not full VR.
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </section>

      {WEDDING_SET_TYPES.includes(event.type) && siblings.length > 0 && (
        <section>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.4 }}
            className="mb-4"
          >
            <p className="text-muted/70 text-[10px] font-bold uppercase tracking-[0.3em]">
              ALSO AVAILABLE
            </p>
            <h2 className="font-display text-text mt-1 text-2xl">
              Other sets for this wedding
            </h2>
            <p className="text-muted mt-1 text-sm">
              Every FMH wedding gets three AR sets — one for each function. Here's what Elation is
              preparing on the other two.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {siblings.slice(0, 2).map((s, i) => (
              <ARSetCard key={s.id} set={s} index={i} />
            ))}
          </div>
        </section>
      )}

      <ARAssetList setId={set?.id ?? showcase?.id} />
    </div>
  )
}
