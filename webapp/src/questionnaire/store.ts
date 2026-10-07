import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { categories, questions, questionsInCategory, visibleQuestions } from './schema'

/** Question answers keyed by question id. */
export type Answers = Record<string, unknown>

/** Stable empty references so selectors don't return a fresh object each render
 * (which would trip zustand's getSnapshot infinite-loop guard). */
export const EMPTY_ANSWERS: Answers = Object.freeze({})
export const EMPTY_DECIDES: Record<string, boolean> = Object.freeze({})

type EventState = {
  answers: Answers
  /** Questions the client explicitly wants Elation to decide. */
  elationDecides: Record<string, boolean>
}

type QState = {
  /** State per event. Keyed by eventId. */
  byEvent: Record<string, EventState>
  lastSavedAt: Record<string, number>

  // reads
  getAnswers: (eventId: string) => Answers
  getDecides: (eventId: string) => Record<string, boolean>

  // writes
  setAnswer: (eventId: string, qid: string, value: unknown) => void
  toggleAnswer: (eventId: string, qid: string, value: string) => void
  setElationDecides: (eventId: string, qid: string, on: boolean) => void
  clearAnswer: (eventId: string, qid: string) => void
  resetEvent: (eventId: string) => void
  /** Idempotent seed — only writes if this event has no data yet. */
  seedEventIfEmpty: (
    eventId: string,
    answers: Answers,
    elationDecides?: Record<string, boolean>,
  ) => void
}

const initial: EventState = { answers: {}, elationDecides: {} }

export const useQuestionnaire = create<QState>()(
  persist(
    (set, get) => ({
      byEvent: {},
      lastSavedAt: {},

      getAnswers: (eventId) => get().byEvent[eventId]?.answers ?? EMPTY_ANSWERS,
      getDecides: (eventId) => get().byEvent[eventId]?.elationDecides ?? EMPTY_DECIDES,

      setAnswer: (eventId, qid, value) =>
        set((s) => {
          const prev = s.byEvent[eventId] ?? initial
          return {
            byEvent: {
              ...s.byEvent,
              [eventId]: {
                ...prev,
                answers: { ...prev.answers, [qid]: value },
                // Setting an explicit value cancels "Elation decides"
                elationDecides: { ...prev.elationDecides, [qid]: false },
              },
            },
            lastSavedAt: { ...s.lastSavedAt, [eventId]: Date.now() },
          }
        }),

      toggleAnswer: (eventId, qid, value) =>
        set((s) => {
          const prev = s.byEvent[eventId] ?? initial
          const current = (prev.answers[qid] as string[] | undefined) ?? []
          const next = current.includes(value)
            ? current.filter((v) => v !== value)
            : [...current, value]
          return {
            byEvent: {
              ...s.byEvent,
              [eventId]: {
                ...prev,
                answers: { ...prev.answers, [qid]: next },
                elationDecides: { ...prev.elationDecides, [qid]: false },
              },
            },
            lastSavedAt: { ...s.lastSavedAt, [eventId]: Date.now() },
          }
        }),

      setElationDecides: (eventId, qid, on) =>
        set((s) => {
          const prev = s.byEvent[eventId] ?? initial
          const nextAnswers = { ...prev.answers }
          if (on) delete nextAnswers[qid]
          return {
            byEvent: {
              ...s.byEvent,
              [eventId]: {
                ...prev,
                answers: nextAnswers,
                elationDecides: { ...prev.elationDecides, [qid]: on },
              },
            },
            lastSavedAt: { ...s.lastSavedAt, [eventId]: Date.now() },
          }
        }),

      clearAnswer: (eventId, qid) =>
        set((s) => {
          const prev = s.byEvent[eventId] ?? initial
          const nextAnswers = { ...prev.answers }
          delete nextAnswers[qid]
          return {
            byEvent: {
              ...s.byEvent,
              [eventId]: { ...prev, answers: nextAnswers },
            },
            lastSavedAt: { ...s.lastSavedAt, [eventId]: Date.now() },
          }
        }),

      resetEvent: (eventId) =>
        set((s) => ({
          byEvent: { ...s.byEvent, [eventId]: initial },
          lastSavedAt: { ...s.lastSavedAt, [eventId]: Date.now() },
        })),

      seedEventIfEmpty: (eventId, answers, elationDecides = {}) =>
        set((s) => {
          if (s.byEvent[eventId]) return s
          return {
            byEvent: {
              ...s.byEvent,
              [eventId]: { answers, elationDecides },
            },
            lastSavedAt: { ...s.lastSavedAt, [eventId]: Date.now() },
          }
        }),
    }),
    { name: 'elation.questionnaire' },
  ),
)

/** True if the answer is meaningful (non-empty string, non-empty array, defined number). */
export function isAnswered(value: unknown): boolean {
  if (value == null || value === '') return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.values(value as object).some((v) => v != null && v !== '')
  return true
}

export type CategoryProgress = {
  slug: string
  title: string
  order: number
  visibleCount: number
  answeredCount: number
  percent: number
  isComplete: boolean
  isStarted: boolean
}

export function computeCategoryProgress(
  answers: Answers,
  decides: Record<string, boolean>,
): CategoryProgress[] {
  const visible = visibleQuestions(questions, answers)
  return categories.map((c) => {
    const catQs = visible.filter((q) => q.category === c.title)
    // Fallback for categories where every question is conditional & hidden.
    const total = catQs.length || questionsInCategory(c.title).length
    const answered = catQs.filter(
      (q) => isAnswered(answers[q.id]) || decides[q.id],
    ).length
    const percent = total === 0 ? 0 : Math.round((answered / total) * 100)
    return {
      slug: c.slug,
      title: c.title,
      order: c.order,
      visibleCount: total,
      answeredCount: answered,
      percent,
      isComplete: total > 0 && answered === total,
      isStarted: answered > 0,
    }
  })
}

export function computeOverallPercent(progress: CategoryProgress[]): number {
  const totals = progress.reduce(
    (acc, c) => ({
      answered: acc.answered + c.answeredCount,
      total: acc.total + c.visibleCount,
    }),
    { answered: 0, total: 0 },
  )
  return totals.total === 0 ? 0 : Math.round((totals.answered / totals.total) * 100)
}
