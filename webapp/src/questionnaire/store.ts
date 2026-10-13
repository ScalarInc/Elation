import { create } from 'zustand'
import type { Answers } from '@elation/shared/questionnaire'
import type { QuestionnaireDto } from '@elation/shared/api'
import { toast } from '@/components/ui/toast'
import { API_MODE, ApiError } from '@/lib/api/client'
import { queryClient } from '@/lib/api/query-client'

// Pure questionnaire logic lives in @elation/shared so the server computes the
// same progress the client sees. Re-exported for existing imports.
export {
  computeCategoryProgress,
  computeOverallPercent,
  isAnswered,
  type Answers,
  type CategoryProgress,
} from '@elation/shared/questionnaire'

/**
 * Questionnaire answers, synced with the server (docs/step-05-questionnaire.md).
 *
 * The store is a write-behind buffer: edits apply locally at once (the UI never
 * waits), are collected as `pending`, and a debounced flush sends them as ONE
 * PATCH with the version we last saw. On a version conflict the server copy is
 * taken and our pending edits are re-applied on top — the latest local intent
 * wins — then saved again.
 */

/** Stable empty references so selectors don't return a fresh object each render. */
export const EMPTY_ANSWERS: Answers = Object.freeze({})
export const EMPTY_DECIDES: Record<string, boolean> = Object.freeze({})

const FLUSH_DELAY_MS = 600
const RETRY_DELAY_MS = 5000

export type Pending = { set: Record<string, unknown>; clear: string[]; decides: Record<string, boolean> }
export const emptyPending = (): Pending => ({ set: {}, clear: [], decides: {} })
const hasPending = (p: Pending) =>
  Object.keys(p.set).length > 0 || p.clear.length > 0 || Object.keys(p.decides).length > 0

type EventState = {
  /** Server answers with pending local edits applied. */
  answers: Answers
  elationDecides: Record<string, boolean>
  /** Version of the last server copy we merged. */
  version: number
  submittedAt: string | null
  pending: Pending
}

export type SyncStatus = { state: 'idle' | 'saving' | 'saved' | 'error'; savedAt?: number; message?: string }

type QState = {
  byEvent: Record<string, EventState>
  sync: Record<string, SyncStatus>

  setAnswer: (eventId: string, qid: string, value: unknown) => void
  toggleAnswer: (eventId: string, qid: string, value: string) => void
  setElationDecides: (eventId: string, qid: string, on: boolean) => void
  clearAnswer: (eventId: string, qid: string) => void

  /** Merge a server copy (keeps unsent local edits on top). */
  hydrate: (eventId: string, dto: QuestionnaireDto) => void
  /** Send pending edits now. Resolves when saved (or failed). */
  flush: (eventId: string) => Promise<void>
  /** Mock mode / brand-new events: local seed if nothing is loaded yet. */
  seedEventIfEmpty: (eventId: string, answers: Answers, elationDecides?: Record<string, boolean>) => void
}

const blank = (): EventState => ({ answers: {}, elationDecides: {}, version: 0, submittedAt: null, pending: emptyPending() })

/** Apply pending edits to a server copy, mirroring the server's own rules. */
export function applyPending(answers: Answers, decides: Record<string, boolean>, p: Pending) {
  const a = { ...answers }
  const d = { ...decides }
  for (const [qid, v] of Object.entries(p.set)) {
    a[qid] = v
    delete d[qid]
  }
  for (const qid of p.clear) delete a[qid]
  for (const [qid, on] of Object.entries(p.decides)) {
    if (on) {
      delete a[qid]
      d[qid] = true
    } else delete d[qid]
  }
  return { answers: a, elationDecides: d }
}

/** Combine two pending batches; `newer` wins per question. */
export function mergePending(older: Pending, newer: Pending): Pending {
  const out: Pending = { set: { ...older.set }, clear: [...older.clear], decides: { ...older.decides } }
  for (const [qid, v] of Object.entries(newer.set)) {
    out.set[qid] = v
    out.clear = out.clear.filter((x) => x !== qid)
    delete out.decides[qid]
  }
  for (const qid of newer.clear) {
    delete out.set[qid]
    if (!out.clear.includes(qid)) out.clear.push(qid)
  }
  for (const [qid, on] of Object.entries(newer.decides)) {
    out.decides[qid] = on
    if (on) {
      delete out.set[qid]
      out.clear = out.clear.filter((x) => x !== qid)
    }
  }
  return out
}

const timers = new Map<string, ReturnType<typeof setTimeout>>()
const inFlight = new Map<string, Promise<void>>()

export const useQuestionnaire = create<QState>()((set, get) => {
  /** Record a local edit and schedule a save. */
  function edit(eventId: string, change: Pending) {
    set((s) => {
      const prev = s.byEvent[eventId] ?? blank()
      const pending = mergePending(prev.pending, change)
      const applied = applyPending(prev.answers, prev.elationDecides, change)
      return {
        byEvent: { ...s.byEvent, [eventId]: { ...prev, ...applied, pending } },
      }
    })
    schedule(eventId, FLUSH_DELAY_MS)
  }

  function schedule(eventId: string, delay: number) {
    clearTimeout(timers.get(eventId))
    timers.set(eventId, setTimeout(() => void get().flush(eventId), delay))
  }

  function setStatus(eventId: string, status: SyncStatus) {
    set((s) => ({ sync: { ...s.sync, [eventId]: status } }))
  }

  async function send(eventId: string, attempt = 0): Promise<void> {
    const state = get().byEvent[eventId]
    if (!state || !hasPending(state.pending)) return

    if (API_MODE === 'mock') {
      set((s) => ({ byEvent: { ...s.byEvent, [eventId]: { ...s.byEvent[eventId], pending: emptyPending() } } }))
      setStatus(eventId, { state: 'saved', savedAt: Date.now() })
      return
    }

    // Take the batch out of `pending`; edits made while it's in flight collect anew.
    const batch = state.pending
    set((s) => ({ byEvent: { ...s.byEvent, [eventId]: { ...s.byEvent[eventId], pending: emptyPending() } } }))
    setStatus(eventId, { state: 'saving' })

    const { questionnaireApi } = await import('@/data/questionnaire')
    try {
      const dto = await questionnaireApi.patch(eventId, {
        version: state.version,
        ...(Object.keys(batch.set).length && { set: batch.set }),
        ...(batch.clear.length && { clear: batch.clear }),
        ...(Object.keys(batch.decides).length && { decides: batch.decides }),
      })
      get().hydrate(eventId, dto)
      setStatus(eventId, { state: 'saved', savedAt: Date.now() })
      // Event basics, progress and status may have changed on the server.
      // (Skip the questionnaire query itself — we just merged its fresh copy.)
      void queryClient.invalidateQueries({
        queryKey: ['events'],
        predicate: (q) => q.queryKey[2] !== 'questionnaire',
      })
    } catch (err) {
      // Put the batch back underneath anything typed since.
      set((s) => {
        const cur = s.byEvent[eventId]
        return { byEvent: { ...s.byEvent, [eventId]: { ...cur, pending: mergePending(batch, cur.pending) } } }
      })
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT' && attempt < 2) {
        const current = (err.details as { current?: QuestionnaireDto } | undefined)?.current
        if (current) get().hydrate(eventId, current)
        toast('Updated from another session', { description: 'Your latest edits were kept.' })
        return send(eventId, attempt + 1)
      }
      if (err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 409) {
        // A rejected answer won't succeed on retry — drop it and reload the server copy.
        set((s) => ({ byEvent: { ...s.byEvent, [eventId]: { ...s.byEvent[eventId], pending: emptyPending() } } }))
        setStatus(eventId, { state: 'error', message: err.message })
        toast.error('Some answers couldn’t be saved', { description: err.message })
        void queryClient.invalidateQueries({ queryKey: ['events', eventId, 'questionnaire'] })
        return
      }
      setStatus(eventId, { state: 'error', message: (err as Error).message })
      schedule(eventId, RETRY_DELAY_MS)
    }
  }

  return {
    byEvent: {},
    sync: {},

    setAnswer: (eventId, qid, value) => {
      const empty = value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
      edit(eventId, empty ? { ...emptyPending(), clear: [qid] } : { ...emptyPending(), set: { [qid]: value } })
    },

    toggleAnswer: (eventId, qid, value) => {
      const current = (get().byEvent[eventId]?.answers[qid] as string[] | undefined) ?? []
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
      get().setAnswer(eventId, qid, next)
    },

    setElationDecides: (eventId, qid, on) => edit(eventId, { ...emptyPending(), decides: { [qid]: on } }),

    clearAnswer: (eventId, qid) => edit(eventId, { ...emptyPending(), clear: [qid] }),

    hydrate: (eventId, dto) =>
      set((s) => {
        const prev = s.byEvent[eventId] ?? blank()
        // Never go backwards (a slow GET resolving after a newer PATCH).
        if (dto.version < prev.version) return s
        const applied = applyPending(dto.answers as Answers, dto.elationDecides, prev.pending)
        return {
          byEvent: {
            ...s.byEvent,
            [eventId]: { ...applied, version: dto.version, submittedAt: dto.submittedAt, pending: prev.pending },
          },
        }
      }),

    flush: async (eventId) => {
      clearTimeout(timers.get(eventId))
      // Serialise saves per event: wait for the one in flight, then send what's left.
      await inFlight.get(eventId)
      const p = send(eventId).finally(() => inFlight.delete(eventId))
      inFlight.set(eventId, p)
      await p
    },

    seedEventIfEmpty: (eventId, answers, elationDecides = {}) =>
      set((s) => {
        if (s.byEvent[eventId]) return s
        return { byEvent: { ...s.byEvent, [eventId]: { ...blank(), answers, elationDecides } } }
      }),
  }
})

/** Save everything pending when the tab is hidden or closed. */
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return
    const { byEvent, flush } = useQuestionnaire.getState()
    for (const [eventId, state] of Object.entries(byEvent)) {
      if (hasPending(state.pending)) void flush(eventId)
    }
  })
}

/** True if there are edits not yet saved for this event. */
export function hasUnsavedAnswers(eventId: string) {
  const state = useQuestionnaire.getState().byEvent[eventId]
  return Boolean(state && hasPending(state.pending))
}
