import { create } from 'zustand'
import { api } from '@/api'
import { applyAreaGates, categories, questions, visibleQuestions } from '@/lib/questionnaire/schema'

/**
 * Questionnaire answers per event, synced with the backend.
 *
 * - `load(eventId)` fetches saved answers once per event (call before showing answers).
 * - Every edit updates local state immediately and schedules a debounced save.
 * - Saves only happen after a successful load, so an empty local state never
 *   overwrites what is stored on the server.
 */

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

type LoadState = 'loading' | 'loaded' | 'error'
type SaveState = 'saving' | 'saved' | 'error'

type QState = {
  /** State per event. Keyed by eventId. */
  byEvent: Record<string, EventState>
  loadState: Record<string, LoadState>
  saveState: Record<string, SaveState>
  /** When the server last confirmed a save (ms timestamp). */
  lastSavedAt: Record<string, number>

  load: (eventId: string) => Promise<void>
  getAnswers: (eventId: string) => Answers
  getDecides: (eventId: string) => Record<string, boolean>

  setAnswer: (eventId: string, qid: string, value: unknown) => void
  toggleAnswer: (eventId: string, qid: string, value: string) => void
  setElationDecides: (eventId: string, qid: string, on: boolean) => void
  clearAnswer: (eventId: string, qid: string) => void
  resetEvent: (eventId: string) => void
}

const initial: EventState = { answers: {}, elationDecides: {} }
const SAVE_DELAY_MS = 800
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()

export const useQuestionnaire = create<QState>()((set, get) => {
  async function save(eventId: string) {
    const state = get().byEvent[eventId] ?? initial
    const percent = computeOverallPercent(computeCategoryProgress(state.answers, state.elationDecides))
    set((s) => ({ saveState: { ...s.saveState, [eventId]: 'saving' } }))
    try {
      await api.questionnaire.save(eventId, { answers: state.answers, elationDecides: state.elationDecides, percent })
      set((s) => ({
        saveState: { ...s.saveState, [eventId]: 'saved' },
        lastSavedAt: { ...s.lastSavedAt, [eventId]: Date.now() },
      }))
    } catch {
      set((s) => ({ saveState: { ...s.saveState, [eventId]: 'error' } }))
    }
  }

  function scheduleSave(eventId: string) {
    if (get().loadState[eventId] !== 'loaded') return
    clearTimeout(saveTimers.get(eventId))
    saveTimers.set(eventId, setTimeout(() => void save(eventId), SAVE_DELAY_MS))
  }

  /** Apply a change to one event's state, then queue a save. Area choices (q9_areas) also
   * answer the linked yes/no questions, so those are never asked twice. */
  function update(eventId: string, change: (prev: EventState) => EventState) {
    set((s) => {
      const next = change(s.byEvent[eventId] ?? initial)
      return { byEvent: { ...s.byEvent, [eventId]: { ...next, answers: applyAreaGates(next.answers) } } }
    })
    scheduleSave(eventId)
  }

  return {
    byEvent: {},
    loadState: {},
    saveState: {},
    lastSavedAt: {},

    load: async (eventId) => {
      const current = get().loadState[eventId]
      if (current === 'loading' || current === 'loaded') return
      set((s) => ({ loadState: { ...s.loadState, [eventId]: 'loading' } }))
      try {
        const saved = await api.questionnaire.get(eventId)
        set((s) => ({
          byEvent: {
            ...s.byEvent,
            [eventId]: { answers: applyAreaGates(saved.answers), elationDecides: saved.elationDecides },
          },
          loadState: { ...s.loadState, [eventId]: 'loaded' },
        }))
      } catch {
        set((s) => ({ loadState: { ...s.loadState, [eventId]: 'error' } }))
      }
    },

    getAnswers: (eventId) => get().byEvent[eventId]?.answers ?? EMPTY_ANSWERS,
    getDecides: (eventId) => get().byEvent[eventId]?.elationDecides ?? EMPTY_DECIDES,

    setAnswer: (eventId, qid, value) =>
      update(eventId, (prev) => ({
        answers: { ...prev.answers, [qid]: value },
        // Setting an explicit value cancels "Elation decides"
        elationDecides: { ...prev.elationDecides, [qid]: false },
      })),

    toggleAnswer: (eventId, qid, value) =>
      update(eventId, (prev) => {
        const current = (prev.answers[qid] as string[] | undefined) ?? []
        const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
        return { answers: { ...prev.answers, [qid]: next }, elationDecides: { ...prev.elationDecides, [qid]: false } }
      }),

    setElationDecides: (eventId, qid, on) =>
      update(eventId, (prev) => {
        const answers = { ...prev.answers }
        if (on) delete answers[qid]
        return { answers, elationDecides: { ...prev.elationDecides, [qid]: on } }
      }),

    clearAnswer: (eventId, qid) =>
      update(eventId, (prev) => {
        const answers = { ...prev.answers }
        delete answers[qid]
        return { ...prev, answers }
      }),

    resetEvent: (eventId) => update(eventId, () => initial),
  }
})
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
    // A category with no visible questions (e.g. "no dance floor") has nothing to answer: it counts as done.
    const total = catQs.length
    const answered = catQs.filter(
      (q) => isAnswered(answers[q.id]) || decides[q.id],
    ).length
    const percent = total === 0 ? 100 : Math.round((answered / total) * 100)
    return {
      slug: c.slug,
      title: c.title,
      order: c.order,
      visibleCount: total,
      answeredCount: answered,
      percent,
      isComplete: answered === total,
      isStarted: answered > 0 || total === 0,
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
