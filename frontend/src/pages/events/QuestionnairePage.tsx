import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Lightbulb,
  Menu,
  Sparkles,
  X,
} from 'lucide-react'
import { useResolvedEvent } from '@/hooks/useResolvedEvent'
import { categories, questions, visibleQuestions } from '@/lib/questionnaire/schema'
import {
  computeCategoryProgress,
  computeOverallPercent,
  EMPTY_ANSWERS,
  EMPTY_DECIDES,
  useQuestionnaire,
} from '@/stores/questionnaireStore'
import { CategoryRail } from '@/components/questionnaire/CategoryRail'
import { QuestionField } from '@/components/questionnaire/QuestionField'
import { CATEGORY_TIPS } from '@/lib/questionnaire/categoryTips'
import { Button } from '@/components/ui/button'
import { PageLoader } from '@/components/ui/page-loader'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { toast } from '@/components/ui/toast'
import { useCurrentUser } from '@/hooks/useCurrentUser'

// ----------------- helpers -----------------

function SavedIndicator({ ts }: { ts?: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(t)
  }, [])
  if (!ts) return null
  const s = Math.max(0, Math.round((now - ts) / 1000))
  const label =
    s < 5 ? 'Saved just now' : s < 60 ? `Saved ${s}s ago` : `Saved ${Math.round(s / 60)}m ago`
  return (
    <span className="text-muted flex items-center gap-1.5 text-xs">
      <span className="bg-success h-1.5 w-1.5 animate-pulse-soft rounded-full" />
      {label}
    </span>
  )
}

function ProgressRing({ percent }: { percent: number }) {
  const size = 44
  const stroke = 4
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const dash = c * (1 - percent / 100)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        className="text-border/15"
        stroke="currentColor"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        className="text-accent"
        stroke="currentColor"
        strokeDasharray={c}
        strokeDashoffset={dash}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 500ms cubic-bezier(0.22, 1, 0.36, 1)' }}
      />
      <text
        x="50%"
        y="52%"
        dominantBaseline="middle"
        textAnchor="middle"
        className="fill-text text-[10px] font-bold tabular-nums"
      >
        {percent}
      </text>
    </svg>
  )
}

// ----------------- page -----------------

export function QuestionnairePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const event = useResolvedEvent(id)
  const user = useCurrentUser()
  const [railOpen, setRailOpen] = useState(false)

  const answers = useQuestionnaire((s) => s.byEvent[id ?? '']?.answers ?? EMPTY_ANSWERS)
  const decides = useQuestionnaire((s) => s.byEvent[id ?? '']?.elationDecides ?? EMPTY_DECIDES)
  const lastSavedAt = useQuestionnaire((s) => s.lastSavedAt[id ?? ''])
  const saveFailed = useQuestionnaire((s) => s.saveState[id ?? ''] === 'error')
  const loadFailed = useQuestionnaire((s) => s.loadState[id ?? ''] === 'error')

  const progress = useMemo(
    () => computeCategoryProgress(answers, decides),
    [answers, decides],
  )
  const overallPercent = useMemo(() => computeOverallPercent(progress), [progress])

  const activeSlug = params.get('c') ?? categories[0].slug
  const activeCategory = categories.find((c) => c.slug === activeSlug) ?? categories[0]
  const activeCategoryProgress = progress.find((p) => p.slug === activeSlug)

  const catQuestions = useMemo(
    () =>
      visibleQuestions(questions, answers).filter((q) => q.category === activeCategory.title),
    [answers, activeCategory],
  )

  // Toast on save events — throttle so rapid typing doesn't spam
  const [lastToastAt, setLastToastAt] = useState(0)
  useEffect(() => {
    if (!lastSavedAt) return
    if (lastSavedAt - lastToastAt < 4000) return
    setLastToastAt(lastSavedAt)
    toast.success('Progress saved', { duration: 1400 })
  }, [lastSavedAt, lastToastAt])

  useEffect(() => {
    if (saveFailed) toast.error("Couldn't save your answers", { description: 'Check your connection; your next change will retry.' })
  }, [saveFailed])
  useEffect(() => {
    if (loadFailed) toast.error("Couldn't load saved answers", { description: 'Reload the page before editing.' })
  }, [loadFailed])

  const idx = categories.findIndex((c) => c.slug === activeSlug)
  const prev = idx > 0 ? categories[idx - 1] : null
  const next = idx < categories.length - 1 ? categories[idx + 1] : null

  function setActive(slug: string) {
    setParams({ c: slug }, { replace: true })
    setRailOpen(false)
    // Scroll main content back to top on category change
    requestAnimationFrame(() => {
      document.getElementById('q-main-scroll')?.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }

  // Keyboard nav — J / K or arrow-left / arrow-right for prev/next
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if ((e.key === 'ArrowRight' || e.key.toLowerCase() === 'k') && next) {
        e.preventDefault()
        setActive(next.slug)
      }
      if ((e.key === 'ArrowLeft' || e.key.toLowerCase() === 'j') && prev) {
        e.preventDefault()
        setActive(prev.slug)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev]) // eslint-disable-line react-hooks/exhaustive-deps

  if (event === undefined) return <PageLoader fullScreen />
  if (!event) {
    return (
      <div className="bg-bg text-text flex min-h-screen items-center justify-center p-8">
        <div className="text-center">
          <h1 className="font-display text-2xl">Event not found</h1>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/events">Back to events</Link>
          </Button>
        </div>
      </div>
    )
  }

  const firstName = user?.name.split(' ')[0]
  const isFirstCategory = idx === 0
  const isLastCategory = idx === categories.length - 1
  const allDone = overallPercent === 100

  const tip = CATEGORY_TIPS[activeSlug]

  return (
    <div className="bg-bg text-text flex min-h-screen flex-col">
      {/* Top bar */}
      <header className="border-border/10 bg-bg/85 sticky top-0 z-30 flex items-center justify-between gap-4 border-b px-4 py-3 backdrop-blur md:px-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(`/events/${event.id}`)}
            aria-label="Close and save"
            className="border-border/15 bg-surface hover:border-accent/40 hover:bg-accent/5 flex h-9 w-9 items-center justify-center rounded-xl border transition"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <p className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">
              Elation Questionnaire
            </p>
            <p className="font-display text-text truncate text-base leading-tight md:text-lg">
              {event.concept ?? event.name}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 md:gap-5">
          <SavedIndicator ts={lastSavedAt} />
          <div className="hidden items-center gap-3 md:flex">
            <div className="text-right">
              <p className="text-muted/70 text-[9px] font-bold uppercase tracking-widest">
                Overall
              </p>
              <p className="text-text text-xs font-semibold tabular-nums">
                {overallPercent}% complete
              </p>
            </div>
            <ProgressRing percent={overallPercent} />
          </div>

          {/* Mobile rail trigger */}
          <Sheet open={railOpen} onOpenChange={setRailOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Show categories"
                className="border-border/15 bg-surface hover:border-accent/40 flex h-9 w-9 items-center justify-center rounded-xl border transition lg:hidden"
              >
                <Menu className="h-4 w-4" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[min(22rem,90vw)] overflow-y-auto">
              <p className="font-display text-text mb-4 text-lg">All categories</p>
              <CategoryRail progress={progress} activeSlug={activeSlug} onSelect={setActive} />
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Category rail (desktop) */}
        <aside className="border-border/10 bg-surface hidden w-80 shrink-0 overflow-y-auto border-r p-5 lg:block">
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-border/10 bg-bg/50 p-3">
            <ProgressRing percent={overallPercent} />
            <div className="min-w-0">
              <p className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">
                Overall
              </p>
              <p className="text-text truncate text-sm font-semibold">
                {overallPercent}% · {progress.reduce((a, c) => a + c.answeredCount, 0)}/
                {progress.reduce((a, c) => a + c.visibleCount, 0)} answered
              </p>
            </div>
          </div>
          <CategoryRail progress={progress} activeSlug={activeSlug} onSelect={setActive} />
        </aside>

        {/* Main content */}
        <main
          id="q-main-scroll"
          className="flex-1 overflow-x-hidden overflow-y-auto"
          style={{ maxHeight: 'calc(100vh - 65px)' }}
        >
          <div className="mx-auto max-w-3xl px-5 py-8 md:px-10 md:py-12">
            {/* Warm intro (only on first category) */}
            {isFirstCategory && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
                className="mb-8 flex items-center gap-3 rounded-3xl border border-accent/20 bg-accent/5 px-5 py-4"
              >
                <span className="bg-accent/20 text-accent flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
                  <Sparkles className="h-4 w-4" />
                </span>
                <p className="text-text text-sm">
                  <span className="font-semibold">Welcome{firstName ? `, ${firstName}` : ''}.</span>{' '}
                  <span className="text-muted">
                    This is a warm-up — everything's saved as you go, and you can hand any
                    question to Elation with a single tap.
                  </span>
                </p>
              </motion.div>
            )}

            {/* Category header */}
            <AnimatePresence mode="wait">
              <motion.header
                key={activeSlug}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25 }}
                className="mb-8"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">
                    Chapter {activeCategory.order} of {categories.length}
                  </p>
                  {activeCategoryProgress && (
                    <p className="text-muted/70 text-[10px] font-bold uppercase tracking-widest tabular-nums">
                      {activeCategoryProgress.answeredCount}/{activeCategoryProgress.visibleCount} answered
                    </p>
                  )}
                </div>
                <h1 className="font-display text-text mt-1 text-4xl leading-tight">
                  {activeCategory.title}
                </h1>
                {activeCategory.intro && (
                  <p className="text-muted mt-3 text-[15px] leading-relaxed">
                    {activeCategory.intro}
                  </p>
                )}
                {tip && (
                  <div className="mt-5 flex items-start gap-3 rounded-2xl border border-border/10 bg-surface/60 px-4 py-3">
                    <span className="text-accent bg-accent/10 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
                      <Lightbulb className="h-3.5 w-3.5" />
                    </span>
                    <p className="text-muted text-xs italic leading-relaxed">
                      <span className="text-text font-semibold not-italic">Elation's tip. </span>
                      {tip}
                    </p>
                  </div>
                )}
              </motion.header>
            </AnimatePresence>

            {/* Questions */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSlug + '-body'}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                {catQuestions.length === 0 ? (
                  <div className="border-border/15 bg-surface flex flex-col items-center gap-3 rounded-3xl border p-12 text-center">
                    <span className="bg-accent/15 text-accent flex h-12 w-12 items-center justify-center rounded-2xl">
                      <Sparkles className="h-5 w-5" />
                    </span>
                    <p className="font-display text-text text-xl">
                      Nothing to answer here.
                    </p>
                    <p className="text-muted max-w-md text-sm">
                      Your earlier answers meant Elation didn't need to ask this. Move
                      forward whenever you're ready.
                    </p>
                  </div>
                ) : (
                  catQuestions.map((q) => (
                    <QuestionField key={q.id} eventId={event.id} question={q} />
                  ))
                )}
              </motion.div>
            </AnimatePresence>

            {/* Prev / Next */}
            <div className="mt-10 flex items-center justify-between gap-3">
              <Button
                variant="outline"
                onClick={() => prev && setActive(prev.slug)}
                disabled={!prev}
                className="min-w-[8rem]"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Previous chapter</span>
                <span className="sm:hidden">Back</span>
              </Button>

              {isLastCategory ? (
                <Button onClick={() => navigate(`/events/${event.id}`)} className="min-w-[8rem]">
                  {allDone ? 'Finish & review' : 'Save & review'}
                  <Check className="h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={() => next && setActive(next.slug)} className="min-w-[8rem]">
                  <span className="hidden sm:inline">Next chapter</span>
                  <span className="sm:hidden">Next</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Keyboard hint */}
            <p className="text-muted/50 mt-6 text-center text-[11px]">
              Tip · use <kbd className="border-border/20 rounded border px-1.5 py-0.5 font-mono text-[10px]">←</kbd> and{' '}
              <kbd className="border-border/20 rounded border px-1.5 py-0.5 font-mono text-[10px]">→</kbd> to move chapters
            </p>
          </div>

          {/* Completion celebration bar (bottom-fixed, appears only at 100%) */}
          <AnimatePresence>
            {allDone && (
              <motion.div
                initial={{ y: 60, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 60, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                className="pointer-events-auto sticky bottom-6 z-20 mx-auto mt-8 flex max-w-2xl items-center justify-between gap-4 rounded-3xl border border-success/30 bg-success/10 px-5 py-3 shadow-lift backdrop-blur"
              >
                <div className="flex items-center gap-3">
                  <span className="bg-success/25 text-success flex h-9 w-9 items-center justify-center rounded-xl">
                    <Check className="h-4 w-4" strokeWidth={3} />
                  </span>
                  <div>
                    <p className="text-text text-sm font-semibold">You're all done{firstName ? `, ${firstName}` : ''}.</p>
                    <p className="text-muted text-xs">
                      Head to your event to see Elation's first moodboard.
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => navigate(`/events/${event.id}?tab=moodboard`)}
                  variant="primary"
                  size="sm"
                >
                  See moodboard
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* Down-arrow hint on desktop when there's overflow (subtle) */}
      <button
        type="button"
        onClick={() => document.getElementById('q-main-scroll')?.scrollBy({ top: 300, behavior: 'smooth' })}
        aria-label="Scroll down"
        className="border-border/15 bg-surface text-muted hover:text-text hover:border-accent/40 fixed bottom-6 right-6 hidden h-10 w-10 items-center justify-center rounded-full border shadow-soft transition lg:flex"
      >
        <ChevronDown className="h-4 w-4" />
      </button>
    </div>
  )
}
