import { useEffect, useMemo, useState } from 'react'
import { api } from '@/api'
import type { ClientEvent } from '@/types'
import { resolveEvent } from '@/lib/questionnaire/derived'
import { EMPTY_ANSWERS, useQuestionnaire } from '@/stores/questionnaireStore'

/**
 * One event with live questionnaire overrides applied (so edits show instantly; the
 * backend applies the same overrides when answers are saved).
 *
 * Returns `undefined` while loading and `null` when the event doesn't exist or isn't yours.
 */
export function useResolvedEvent(eventId: string | undefined): ClientEvent | null | undefined {
  const [loaded, setLoaded] = useState<{ id: string; event: ClientEvent | null }>()
  const loadAnswers = useQuestionnaire((s) => s.load)
  const answers = useQuestionnaire(
    (s) => (eventId ? s.byEvent[eventId]?.answers : undefined) ?? EMPTY_ANSWERS,
  )

  useEffect(() => {
    if (!eventId) return
    let cancelled = false
    api.events.get(eventId).then(
      (event) => !cancelled && setLoaded({ id: eventId, event }),
      () => !cancelled && setLoaded({ id: eventId, event: null }),
    )
    void loadAnswers(eventId)
    return () => {
      cancelled = true
    }
  }, [eventId, loadAnswers])

  return useMemo(() => {
    if (!eventId) return null
    if (!loaded || loaded.id !== eventId) return undefined
    return loaded.event ? resolveEvent(loaded.event, answers) : null
  }, [loaded, eventId, answers])
}

/** All of the client's events, for list pages. Empty while loading. */
export function useResolvedEvents(): ClientEvent[] {
  const [events, setEvents] = useState<ClientEvent[]>([])
  const byEvent = useQuestionnaire((s) => s.byEvent)

  useEffect(() => {
    let cancelled = false
    api.events.list().then(
      (rows) => !cancelled && setEvents(rows),
      () => undefined, // pages show their empty state; sign-in problems are handled by the auth guard
    )
    return () => {
      cancelled = true
    }
  }, [])

  return useMemo(
    () => events.map((e) => resolveEvent(e, byEvent[e.id]?.answers ?? EMPTY_ANSWERS)),
    [events, byEvent],
  )
}
