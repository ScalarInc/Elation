import type { CreateEventBody, EventDto, ListEventsQuery, UpdateEventBody } from '@elation/shared/api'
import { deriveNextStep, deriveStatus, todayIso } from '@elation/shared/events'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { API_MODE, apiFetch } from '@/lib/api/client'
// oxlint-disable-next-line no-restricted-imports -- mock mode is the one place fixtures may supply events
import { events as fixtureEvents } from '@/mocks/fixtures'
import type { FixtureEvent } from '@/mocks/types'

/**
 * Events (docs/step-04-events.md). Every component that shows events reads
 * them through these hooks — never from src/mocks directly.
 */

export const eventsKey = ['events'] as const
export const eventKey = (id: string) => ['events', id] as const

// ─────────────── mock mode (no server) ───────────────

const QUESTIONNAIRE_PERCENT = { complete: 100, in_progress: 50, pending: 0 } as const

function fromFixture(e: FixtureEvent): EventDto {
  const date = e.date.slice(0, 10)
  return {
    id: e.id,
    clientId: e.clientId,
    name: e.name,
    concept: e.concept ?? null,
    type: e.type,
    date,
    venue: e.venue,
    guests: e.guests,
    budgetPKR: e.budgetPKR,
    coverImage: e.coverImage,
    status: deriveStatus(e.status === 'draft' ? 'DRAFT' : 'ACTIVE', date),
    progress: e.progress,
    questionnairePercent: QUESTIONNAIRE_PERCENT[e.progress.questionnaire],
    nextStep: deriveNextStep(e.id, e.progress, QUESTIONNAIRE_PERCENT[e.progress.questionnaire]),
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  }
}

let mockEvents: EventDto[] = fixtureEvents.map(fromFixture)
const later = <T,>(value: T) => new Promise<T>((r) => setTimeout(() => r(structuredClone(value)), 200))

const mockApi = {
  list: () => later(mockEvents.filter((e) => e.status !== 'archived')),
  get: (id: string) => {
    const e = mockEvents.find((x) => x.id === id)
    return e ? later(e) : Promise.reject(new Error('Event not found'))
  },
  create: (body: CreateEventBody) => {
    const id = crypto.randomUUID()
    const progress = { questionnaire: 'in_progress', moodboard: 'pending', budget: 'pending', ar: 'pending' } as const
    const created: EventDto = {
      id,
      clientId: 'mock',
      name: body.concept,
      concept: body.concept,
      type: body.type,
      date: body.date,
      venue: { name: body.venueName, city: body.city, indoor: body.venueSetting },
      guests: body.guests,
      budgetPKR: body.budgetPkr ?? null,
      coverImage: '/media/img_11.jpg',
      status: deriveStatus('DRAFT', body.date, todayIso()),
      progress,
      questionnairePercent: 10,
      nextStep: deriveNextStep(id, progress, 10),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    mockEvents = [...mockEvents, created]
    return later(created)
  },
  update: (id: string, body: UpdateEventBody) => {
    mockEvents = mockEvents.map((e) =>
      e.id !== id
        ? e
        : {
            ...e,
            ...(body.concept && { concept: body.concept, name: body.concept }),
            ...(body.type && { type: body.type }),
            ...(body.date && { date: body.date }),
            ...(body.guests && { guests: body.guests }),
            ...(body.budgetPkr !== undefined && { budgetPKR: body.budgetPkr }),
            venue: {
              name: body.venueName ?? e.venue.name,
              city: body.city ?? e.venue.city,
              indoor: body.venueSetting ?? e.venue.indoor,
            },
          },
    )
    return mockApi.get(id)
  },
  setArchived: (id: string, archived: boolean) => {
    mockEvents = mockEvents.map((e) =>
      e.id === id ? { ...e, status: archived ? 'archived' : deriveStatus('ACTIVE', e.date) } : e,
    )
    return mockApi.get(id)
  },
  duplicate: (id: string) => {
    const source = mockEvents.find((e) => e.id === id)!
    const concept = `${source.concept ?? source.name} (copy)`
    return mockApi.create({
      type: source.type,
      concept,
      date: source.date,
      guests: source.guests,
      venueName: source.venue.name,
      city: source.venue.city,
      venueSetting: source.venue.indoor,
      budgetPkr: source.budgetPKR,
    })
  },
  remove: (id: string) => {
    mockEvents = mockEvents.filter((e) => e.id !== id)
    return later(undefined)
  },
}

// ─────────────── API ───────────────

function query(params: ListEventsQuery) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][])
  return qs.size ? `?${qs}` : ''
}

export const eventsApi =
  API_MODE === 'mock'
    ? mockApi
    : {
        list: (params: ListEventsQuery = {}) => apiFetch<EventDto[]>(`/events${query(params)}`),
        get: (id: string) => apiFetch<EventDto>(`/events/${id}`),
        create: (body: CreateEventBody) => apiFetch<EventDto>('/events', { method: 'POST', body }),
        update: (id: string, body: UpdateEventBody) =>
          apiFetch<EventDto>(`/events/${id}`, { method: 'PATCH', body }),
        setArchived: (id: string, archived: boolean) =>
          apiFetch<EventDto>(`/events/${id}/${archived ? 'archive' : 'unarchive'}`, { method: 'POST' }),
        duplicate: (id: string) => apiFetch<EventDto>(`/events/${id}/duplicate`, { method: 'POST' }),
        remove: (id: string) => apiFetch<void>(`/events/${id}`, { method: 'DELETE' }),
      }

// ─────────────── hooks ───────────────

/** All non-archived events of the signed-in client (filtering/sorting happens in the page). */
export function useEvents() {
  return useQuery({ queryKey: eventsKey, queryFn: () => eventsApi.list() })
}

export function useArchivedEvents(enabled: boolean) {
  return useQuery({
    queryKey: ['events', 'archived'],
    queryFn: () => (API_MODE === 'mock' ? later([] as EventDto[]) : apiFetch<EventDto[]>('/events?status=archived')),
    enabled,
  })
}

export function useEvent(id: string | undefined) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: eventKey(id ?? ''),
    queryFn: () => eventsApi.get(id!),
    enabled: Boolean(id),
    // Show the list's copy instantly while the detail request is in flight.
    placeholderData: () => qc.getQueryData<EventDto[]>(eventsKey)?.find((e) => e.id === id),
  })
}

/**
 * "The" event for the dashboard: the soonest upcoming event, else the most
 * recent past one. Replaces every hard-coded `events[0]`.
 */
export function pickPrimaryEvent(events: EventDto[] | undefined): EventDto | undefined {
  if (!events?.length) return undefined
  const upcoming = events.filter((e) => e.status === 'active' || e.status === 'draft')
  const byDate = (a: EventDto, b: EventDto) => a.date.localeCompare(b.date)
  if (upcoming.length) return [...upcoming].sort(byDate)[0]
  return [...events].sort(byDate).at(-1)
}

function useInvalidateEvents() {
  const qc = useQueryClient()
  return (event?: EventDto) => {
    if (event) qc.setQueryData(eventKey(event.id), event)
    return qc.invalidateQueries({ queryKey: eventsKey })
  }
}

export function useCreateEvent() {
  const invalidate = useInvalidateEvents()
  return useMutation({ mutationFn: eventsApi.create, onSuccess: invalidate })
}

export function useUpdateEvent(id: string) {
  const invalidate = useInvalidateEvents()
  return useMutation({ mutationFn: (body: UpdateEventBody) => eventsApi.update(id, body), onSuccess: invalidate })
}

export function useDuplicateEvent() {
  const invalidate = useInvalidateEvents()
  return useMutation({ mutationFn: eventsApi.duplicate, onSuccess: invalidate })
}

export function useArchiveEvent() {
  const invalidate = useInvalidateEvents()
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) => eventsApi.setArchived(id, archived),
    onSuccess: invalidate,
  })
}

export function useDeleteEvent() {
  const invalidate = useInvalidateEvents()
  return useMutation({ mutationFn: eventsApi.remove, onSuccess: () => invalidate() })
}
