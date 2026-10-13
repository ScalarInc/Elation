import { Link, useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  MapPin,
  Users,
  Wallet,
  ClipboardList,
  Palette,
  Calculator,
  Boxes,
  Check,
  Clock,
  Loader2,
} from 'lucide-react'
import { ActivityFeed } from '@/components/ActivityFeed'
import { useThreads } from '@/data/chat'
import { useCurrentUser } from '@/data/auth'
import { useEventBudget } from '@/data/budget'
import { BUDGET_TONE } from '@/components/budget/tone'
import { useEventMoodboards } from '@/data/moodboards'
import { MoodboardViewer } from '@/components/MoodboardViewer'
import { useEventView } from '@/data/events'
import { useQuestionnaireSync } from '@/data/questionnaire'
import {
  computeCategoryProgress,
  computeOverallPercent,
  EMPTY_ANSWERS,
  EMPTY_DECIDES,
  useQuestionnaire,
} from '@/questionnaire/store'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { formatDate, daysUntil, formatBudget, formatPKR, formatPKRCompact } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { ClientEvent, ModuleStatus } from '@/mocks/types'

const weight: Record<ModuleStatus, number> = { complete: 1, in_progress: 0.5, pending: 0 }

const moduleIcons = {
  questionnaire: ClipboardList,
  moodboard: Palette,
  budget: Calculator,
  ar: Boxes,
} as const

const moduleMeta: Record<
  keyof ClientEvent['progress'],
  { label: string; body: string; href: (id: string) => string }
> = {
  questionnaire: {
    label: 'Questionnaire',
    body: '134 guided questions to shape every decision.',
    href: (id) => `/events/${id}?tab=questionnaire`,
  },
  moodboard: {
    label: 'Moodboard',
    body: 'A concept board curated from your answers and inventory.',
    href: (id) => `/events/${id}?tab=moodboard`,
  },
  budget: {
    label: 'Budget Estimator',
    body: 'Live pricing with a traffic-light indicator vs. your budget.',
    href: (id) => `/events/${id}/budget?from=event`,
  },
  ar: {
    label: 'AR Visualization',
    body: 'Walk your venue on Meta Quest 3 before the doors open.',
    href: (id) => `/events/${id}?tab=ar`,
  },
}

const statusStyles: Record<ModuleStatus, { badge: 'sage' | 'accent' | 'outline'; text: string; Icon: React.ComponentType<{ className?: string }> }> = {
  complete: { badge: 'sage', text: 'Complete', Icon: Check },
  in_progress: { badge: 'accent', text: 'In Progress', Icon: Loader2 },
  pending: { badge: 'outline', text: 'Pending', Icon: Clock },
}

const TAB_KEYS = ['overview', 'questionnaire', 'moodboard', 'budget', 'ar', 'files', 'messages'] as const
type TabKey = (typeof TAB_KEYS)[number]

function EventNotFound() {
  return (
    <div className="px-10 pb-12 pt-8">
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <h1 className="font-display text-2xl">Event not found</h1>
          <p className="text-muted/70 text-sm">
            The event you're looking for doesn't exist or was archived.
          </p>
          <Button asChild variant="outline">
            <Link to="/events">Back to My Events</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function Hero({ event }: { event: ClientEvent }) {
  const days = daysUntil(event.date)

  return (
    <div className="shadow-card relative h-72 overflow-hidden rounded-3xl">
      <img src={event.coverImage} alt={event.name} className="h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/10" />

      <div className="absolute inset-0 flex flex-col justify-between p-8 text-white">
        <Link
          to="/events"
          className="inline-flex w-fit items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-semibold tracking-wide backdrop-blur transition hover:bg-white/25"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All events
        </Link>

        <div>
          <div className="flex items-center gap-2">
            <Badge variant="accent" className="bg-white/85 text-ink">
              {event.type}
            </Badge>
            {event.status === 'draft' && <Badge variant="warning">Draft</Badge>}
            {event.status === 'past' && <Badge variant="outline" className="text-white/80 border-white/30">Past</Badge>}
          </div>
          <h1 className="font-display mt-2 text-4xl">{event.concept ?? event.name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-white/85">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              {formatDate(event.date)}
              {event.status !== 'past' && <span className="text-white/60">· {days} days to go</span>}
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {event.venue.name} · {event.venue.city}
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              {event.guests} guests
            </span>
            <span className="flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5" />
              {formatBudget(event.budgetPKR)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function ModuleCard({
  event,
  moduleKey,
}: {
  event: ClientEvent
  moduleKey: keyof ClientEvent['progress']
}) {
  const status = event.progress[moduleKey]
  const meta = moduleMeta[moduleKey]
  const s = statusStyles[status]
  const Icon = moduleIcons[moduleKey]

  return (
    <Link
      to={meta.href(event.id)}
      className="bg-cream-panel border-border/10 hover:shadow-soft flex flex-col justify-between gap-4 rounded-2xl border p-5 shadow-card transition hover:-translate-y-0.5"
    >
      <div>
        <div className="flex items-start justify-between">
          <span className="bg-accent/15 text-accent flex h-10 w-10 items-center justify-center rounded-xl">
            <Icon className="h-4 w-4" />
          </span>
          <Badge variant={s.badge}>
            <s.Icon
              className={cn(
                'h-3 w-3',
                status === 'in_progress' && 'animate-spin',
              )}
            />
            {s.text}
          </Badge>
        </div>
        <p className="text-text mt-4 text-sm font-semibold">{meta.label}</p>
        <p className="text-muted mt-1 text-xs leading-snug">{meta.body}</p>
      </div>
      <div className="text-accent flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest">
        Open
        <ArrowRight className="h-3 w-3" />
      </div>
    </Link>
  )
}

function OverviewTab({ event }: { event: ClientEvent }) {
  const pct = Math.round(
    ((weight[event.progress.questionnaire] +
      weight[event.progress.moodboard] +
      weight[event.progress.budget] +
      weight[event.progress.ar]) /
      4) *
      100,
  )
  const { data: eventBoards = [] } = useEventMoodboards(event.id)
  // Lead concept first, then the newest.
  const boards = [...eventBoards].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
  const { data: budget } = useEventBudget(event.id)
  const plan = budget?.plan

  return (
    <div className="mt-4 space-y-6">
      {/* Overall progress bar */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="text-muted/70 text-[10px] font-bold tracking-widest">OVERALL PROGRESS</p>
            <p className="font-display text-text mt-1 text-2xl">{pct}% ready</p>
          </div>
          <div className="min-w-[240px] flex-1 sm:max-w-md">
            <Progress value={pct} />
          </div>
          <Button asChild>
            <Link to={`/events/${event.id}?tab=questionnaire`}>
              Continue
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Module cards */}
      <div>
        <h2 className="font-display text-text mb-3 text-lg">Modules</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(moduleMeta) as (keyof ClientEvent['progress'])[]).map((key) => (
            <ModuleCard key={key} event={event} moduleKey={key} />
          ))}
        </div>
      </div>

      {/* Concept snapshot */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-text text-lg">Latest Moodboard</h2>
              {boards[0] && (
                <Link
                  to={`/events/${event.id}?tab=moodboard`}
                  className="text-muted hover:text-text flex items-center gap-1 text-xs font-semibold"
                >
                  Open moodboard <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
            {boards[0] ? (
              <>
                <div className="mt-4 grid grid-cols-4 gap-2">
                  {boards[0].tiles.slice(0, 4).map((src, i) => (
                    <img
                      key={i}
                      src={src}
                      className="h-24 w-full rounded-xl object-cover"
                      alt=""
                    />
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-2">
                  {boards[0].palette.slice(0, 6).map((hex) => (
                    <span
                      key={hex}
                      className="ring-border/10 h-5 w-5 rounded-full ring-2"
                      style={{ background: hex }}
                      title={hex}
                    />
                  ))}
                </div>
              </>
            ) : (
              <p className="text-muted mt-4 text-sm">
                No moodboard yet. Elation will draft one once the questionnaire is far enough along.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h2 className="font-display text-text text-lg">Key numbers</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Guests</dt>
                <dd className="text-text font-semibold">{event.guests}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Budget</dt>
                <dd className="text-text font-semibold">{formatBudget(event.budgetPKR)}</dd>
              </div>
              {plan && (
                <div className="flex justify-between">
                  <dt className="text-muted">Estimate</dt>
                  <dd className="text-text font-semibold">{formatPKRCompact(plan.totals.includedPkr)} · {plan.lines.length} pieces</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted">Venue</dt>
                <dd className="text-text font-semibold">{event.venue.indoor}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Days to go</dt>
                <dd className="text-text font-semibold">
                  {event.status === 'past' ? '—' : daysUntil(event.date)}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      <EventActivity eventId={event.id} />
    </div>
  )
}

function QuestionnaireSummary({ eventId }: { eventId: string }) {
  const answers = useQuestionnaire((s) => s.byEvent[eventId]?.answers ?? EMPTY_ANSWERS)
  const decides = useQuestionnaire((s) => s.byEvent[eventId]?.elationDecides ?? EMPTY_DECIDES)
  const progress = computeCategoryProgress(answers, decides)
  const overall = computeOverallPercent(progress)

  const started = progress.filter((c) => c.isStarted).length
  const done = progress.filter((c) => c.isComplete).length
  const total = progress.length

  return (
    <div className="mt-4 space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-6 p-6">
          <div>
            <p className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">
              QUESTIONNAIRE
            </p>
            <p className="font-display text-text mt-1 text-2xl">
              {overall === 0
                ? 'Not started'
                : overall < 100
                ? `${overall}% complete`
                : 'All categories answered'}
            </p>
            <p className="text-muted mt-1 text-xs">
              {done} of {total} categories complete · {started} started
            </p>
          </div>
          <div className="min-w-[240px] flex-1 sm:max-w-md">
            <Progress value={overall} />
          </div>
          <Button asChild>
            <Link to={`/events/${eventId}/questionnaire`}>
              {overall === 0 ? 'Start questionnaire' : 'Continue questionnaire'}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <div>
        <h2 className="font-display text-text mb-3 text-lg">Categories</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {progress.map((c) => (
            <Link
              key={c.slug}
              to={`/events/${eventId}/questionnaire?c=${c.slug}`}
              className="bg-cream-panel border-border/10 hover:shadow-soft flex items-center justify-between rounded-2xl border p-4 shadow-card transition hover:-translate-y-0.5"
            >
              <div className="min-w-0">
                <p className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">
                  {String(c.order).padStart(2, '0')}
                </p>
                <p className="text-text mt-0.5 truncate text-sm font-semibold">{c.title}</p>
              </div>
              <div className="ml-4 text-right">
                <p className="text-text font-display text-lg leading-none">{c.percent}%</p>
                <p className="text-muted/70 mt-1 text-[10px]">
                  {c.answeredCount}/{c.visibleCount}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

function TabPlaceholder({ title, body }: { title: string; body: string }) {
  return (
    <Card className="mt-4">
      <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
        <p className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">
          Coming next
        </p>
        <p className="font-display text-text text-xl">{title}</p>
        <p className="text-muted max-w-md text-sm">{body}</p>
      </CardContent>
    </Card>
  )
}

/** Budget tab: the live numbers, one click from the estimator (docs/step-08-budget.md, J2). */
function BudgetSummary({ eventId }: { eventId: string }) {
  const { data, isPending } = useEventBudget(eventId)
  const href = `/events/${eventId}/budget?from=event`
  if (isPending) return <Skeleton className="mt-4 h-56 w-full rounded-3xl" />
  const plan = data?.plan
  if (!plan) {
    return (
      <ModuleHandoff
        title="Smart Budget Estimator"
        body="Start from your moodboard or Elation's recommendation — live pricing and a traffic light against your target."
        href={href}
        cta="Start your budget"
      />
    )
  }
  const tone = BUDGET_TONE[plan.classification.state]
  const Icon = tone.Icon
  return (
    <Card className="mt-4">
      <CardContent className="grid gap-6 p-6 md:grid-cols-[1fr_1fr]">
        <div className="space-y-4">
          <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold', tone.pill)}>
            <Icon className="h-3.5 w-3.5" />
            {tone.label}
          </span>
          <div>
            <p className="font-display text-text text-3xl tabular-nums">{formatPKR(plan.totals.includedPkr)}</p>
            <p className="text-muted mt-1 text-sm">
              of {formatPKR(plan.targetPkr)} ·{' '}
              {plan.classification.deltaPkr > 0
                ? `${formatPKRCompact(plan.classification.deltaPkr)} over`
                : `${formatPKRCompact(-plan.classification.deltaPkr)} to spare`}
            </p>
          </div>
          <Button asChild>
            <Link to={href}>
              Open the estimator
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
        <div>
          <p className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">Top categories</p>
          <ul className="mt-3 space-y-2 text-sm">
            {plan.totals.byCategory.slice(0, 3).map((c) => (
              <li key={c.category} className="flex justify-between">
                <span className="text-text font-semibold">{c.category}</span>
                <span className="text-muted tabular-nums">{formatPKRCompact(c.totalPkr)}</span>
              </li>
            ))}
            {plan.totals.byCategory.length === 0 && <li className="text-muted">Nothing included yet.</li>}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}

function ModuleHandoff({
  title,
  body,
  href,
  cta,
}: {
  title: string
  body: string
  href: string
  cta: string
}) {
  return (
    <Card className="mt-4">
      <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
        <p className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">
          Dedicated module
        </p>
        <p className="font-display text-text text-2xl">{title}</p>
        <p className="text-muted max-w-md text-sm">{body}</p>
        <Button asChild size="lg">
          <Link to={href}>
            {cta}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

function EventActivity({ eventId }: { eventId: string }) {
  const { data: threads } = useThreads()
  const thread = threads?.find((t) => t.eventId === eventId)
  return (
    <ActivityFeed
      eventId={eventId}
      title="Recent activity"
      subtitle="Everything that happened on this event."
      limit={5}
      messagesHref={thread ? `/messages?thread=${thread.id}` : '/messages'}
    />
  )
}

/** The event's own conversation with the consultant, opened in Messages. */
function EventThreadHandoff({ eventId }: { eventId: string }) {
  const me = useCurrentUser()
  const { data: threads } = useThreads()
  const thread = threads?.find((t) => t.eventId === eventId)
  const consultant = me.consultant?.name ?? 'your consultant'
  const last = thread?.lastMessage
  return (
    <ModuleHandoff
      title="Event thread"
      body={
        last
          ? `Latest: “${last.body.length > 120 ? `${last.body.slice(0, 117)}…` : last.body}”`
          : `A direct line to ${consultant} about this event — moodboard notes, questions, follow-ups.`
      }
      href={thread ? `/messages?thread=${thread.id}` : '/messages'}
      cta={thread?.unread ? `Open messages (${thread.unread} new)` : 'Open messages'}
    />
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

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { event, isPending } = useEventView(id)
  useQuestionnaireSync(event ? id : undefined)

  if (isPending) return <PageSkeleton />
  if (!event) return <EventNotFound />

  const rawTab = params.get('tab') as TabKey | null
  const tab: TabKey = rawTab && TAB_KEYS.includes(rawTab) ? rawTab : 'overview'

  function setTab(next: string) {
    if (next === 'overview') {
      params.delete('tab')
    } else {
      params.set('tab', next)
    }
    setParams(params, { replace: true })
  }

  // Fallback: unknown tab param in URL → normalise
  if (rawTab && rawTab !== tab) {
    navigate(`/events/${event.id}`, { replace: true })
  }

  return (
    <div className="px-10 pb-12 pt-8">
      <Hero event={event} />

      <Tabs value={tab} onValueChange={setTab} className="mt-8">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="questionnaire">Questionnaire</TabsTrigger>
          <TabsTrigger value="moodboard">Moodboard</TabsTrigger>
          <TabsTrigger value="budget">Budget</TabsTrigger>
          <TabsTrigger value="ar">AR</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab event={event} />
        </TabsContent>

        <TabsContent value="questionnaire">
          <QuestionnaireSummary eventId={event.id} />
        </TabsContent>
        <TabsContent value="moodboard">
          <MoodboardViewer eventId={event.id} />
        </TabsContent>
        <TabsContent value="budget">
          <BudgetSummary eventId={event.id} />
        </TabsContent>
        <TabsContent value="ar">
          <ModuleHandoff
            title="AR Visualization"
            body="Preview your event on Meta Quest 3 — AR passthrough of the finished venue."
            href={`/events/${event.id}/ar`}
            cta="Open the AR studio"
          />
        </TabsContent>
        <TabsContent value="files">
          <TabPlaceholder
            title="Files & references"
            body="Venue photos, floor plans, inspiration boards. Sprint 12."
          />
        </TabsContent>
        <TabsContent value="messages">
          <EventThreadHandoff eventId={event.id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
