import { useEffect, useMemo, useState } from 'react'
import { api } from '@/api'
import type { ClientEvent } from '@/types'
import { resolveEvent } from '@/lib/questionnaire/derived'
import { EMPTY_ANSWERS, useQuestionnaire } from '@/stores/questionnaireStore'

/** Subscribe to one event's derived state. Undefined while loading or if missing. */
export function useResolvedEvent(eventId: string | undefined): ClientEvent | undefined {
  const [loaded, setLoaded] = useState<{ id: string; event?: ClientEvent }>()
  const answers = useQuestionnaire(
    (s) => (eventId ? s.byEvent[eventId]?.answers : undefined) ?? EMPTY_ANSWERS,
  )

  useEffect(() => {
    if (!eventId) return
    let cancelled = false
    api.events.get(eventId).then((event) => {
      if (!cancelled) setLoaded({ id: eventId, event })
    })
    return () => {
      cancelled = true
    }
  }, [eventId])

  return useMemo(() => {
    const base = loaded && loaded.id === eventId ? loaded.event : undefined
    return base ? resolveEvent(base, answers) : undefined
  }, [loaded, eventId, answers])
}

/** Subscribe to all events' derived state — for list pages. Empty while loading. */
export function useResolvedEvents(): ClientEvent[] {
  const [events, setEvents] = useState<ClientEvent[]>([])
  const byEvent = useQuestionnaire((s) => s.byEvent)

  useEffect(() => {
    let cancelled = false
    api.events.list().then((rows) => {
      if (!cancelled) setEvents(rows)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return useMemo(
    () => events.map((e) => resolveEvent(e, byEvent[e.id]?.answers ?? EMPTY_ANSWERS)),
    [events, byEvent],
  )
}
