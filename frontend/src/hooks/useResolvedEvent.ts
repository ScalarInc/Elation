import { useMemo } from 'react'
import { events } from '@/mocks/fixtures'
import type { ClientEvent } from '@/types'
import { resolveEvent } from '@/lib/questionnaire/derived'
import { EMPTY_ANSWERS, useQuestionnaire } from '@/stores/questionnaireStore'

/** Subscribe to one event's derived state. */
export function useResolvedEvent(eventId: string | undefined): ClientEvent | undefined {
  const answers = useQuestionnaire(
    (s) => (eventId ? s.byEvent[eventId]?.answers : undefined) ?? EMPTY_ANSWERS,
  )
  return useMemo(() => {
    if (!eventId) return undefined
    const base = events.find((e) => e.id === eventId)
    return base ? resolveEvent(base, answers) : undefined
  }, [eventId, answers])
}

/** Subscribe to all events' derived state — for list pages. */
export function useResolvedEvents(): ClientEvent[] {
  const byEvent = useQuestionnaire((s) => s.byEvent)
  return useMemo(
    () =>
      events.map((e) => resolveEvent(e, byEvent[e.id]?.answers ?? EMPTY_ANSWERS)),
    [byEvent],
  )
}
