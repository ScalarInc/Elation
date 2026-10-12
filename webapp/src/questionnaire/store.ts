import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Answers } from '@elation/shared/questionnaire'

// Pure questionnaire logic lives in @elation/shared so the server computes the
// same progress the client sees. Re-exported for existing imports.
export {
  computeCategoryProgress,
  computeOverallPercent,
  isAnswered,
  type Answers,
  type CategoryProgress,
} from '@elation/shared/questionnaire'

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
