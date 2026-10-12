import { useMemo } from 'react'
import { BUDGET_BAND_MIDPOINTS } from '@elation/shared/budget'
import { EVENT_TYPES, type EventType } from '@elation/shared/domain'
import type { ClientEvent } from '@/mocks/types'
import { useEvent, useEvents } from '@/data/events'
import {
  EMPTY_ANSWERS,
  type Answers,
  useQuestionnaire,
} from './store'

/**
 * INTERIM (until Step 5 moves the questionnaire to the server): the event
 * comes from the API, and unsaved-to-server questionnaire answers kept in the
 * local store are overlaid on the event basics so edits show immediately.
 * In Step 5 the server writes answers through to the event and this overlay
 * is deleted (docs/step-04-events.md, decision P3).
 */
export function resolveEvent(base: ClientEvent, answers: Answers): ClientEvent {
  const type = answers.q1_type
  const date = answers.q3_date
  const guests = answers.q4_guests
  const venueName = answers.q5_venue
  const indoor = answers.q6_indoor
  const budgetBand = answers.q121_budget
  const conceptName = answers.q2_name

  return {
    ...base,
    concept:
      typeof conceptName === 'string' && conceptName.trim().length > 0
        ? conceptName
        : base.concept,
    type: typeof type === 'string' && EVENT_TYPES.includes(type as EventType)
      ? (type as EventType)
      : base.type,
    date:
      typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date)
        ? date.slice(0, 10)
        : base.date,
    guests: typeof guests === 'number' && guests > 0 ? guests : base.guests,
    venue: {
      ...base.venue,
      name: typeof venueName === 'string' && venueName.trim().length > 0
        ? venueName
        : base.venue.name,
      indoor: indoor === 'Indoor' || indoor === 'Outdoor' || indoor === 'Both'
        ? indoor
        : base.venue.indoor,
    },
    // A budget band only fills in a missing budget — an explicit figure always wins.
    budgetPKR:
      base.budgetPKR == null && typeof budgetBand === 'string' && BUDGET_BAND_MIDPOINTS[budgetBand] != null
        ? BUDGET_BAND_MIDPOINTS[budgetBand]
        : base.budgetPKR,
  }
}

/** One event (from the API) with local questionnaire overlay. */
export function useResolvedEvent(eventId: string | undefined) {
  const query = useEvent(eventId)
  const answers = useQuestionnaire(
    (s) => (eventId ? s.byEvent[eventId]?.answers : undefined) ?? EMPTY_ANSWERS,
  )
  const event = useMemo(
    () => (query.data ? resolveEvent(query.data, answers) : undefined),
    [query.data, answers],
  )
  return { event, isPending: query.isPending && Boolean(eventId), isError: query.isError, refetch: query.refetch }
}

/** All of the client's events (from the API) with local questionnaire overlay. */
export function useResolvedEvents() {
  const query = useEvents()
  const byEvent = useQuestionnaire((s) => s.byEvent)
  const events = useMemo(
    () => (query.data ?? []).map((e) => resolveEvent(e, byEvent[e.id]?.answers ?? EMPTY_ANSWERS)),
    [query.data, byEvent],
  )
  return { events, isPending: query.isPending, isError: query.isError, refetch: query.refetch }
}

// ---------------- Moodboard-facing derivations ----------------

const MOOD_MAP: Record<string, string> = {
  Romantic: 'Romantic',
  Regal: 'Regal',
  Dramatic: 'Dramatic',
  Luxurious: 'Regal',
  'Sacred/Serene': 'Serene',
  Dreamy: 'Whimsical',
  Bohemian: 'Bohemian',
}

const STYLE_MAP: Record<string, string> = {
  Modern: 'Modern Luxury',
  'Modern Luxury': 'Modern Luxury',
  Luxury: 'Modern Luxury',
  Traditional: 'Traditional',
  Bohemian: 'Editorial',
  Architectural: 'Architectural',
  Organic: 'Garden',
  Rustic: 'Garden',
}

const VENUE_FROM_INDOOR: Record<string, string> = {
  Indoor: 'Ballroom',
  Outdoor: 'Hilltop Outdoor',
  Both: 'Terrace',
}

export type DerivedMoodboardDefaults = {
  mood: string | undefined
  style: string | undefined
  palette: string[] | undefined
  density: string | undefined
  venue: string | undefined
  /** True when at least one control derived from a client answer. */
  fromQuestionnaire: boolean
}

function pickFirst<T>(arr: unknown, map?: Record<string, T>): T | undefined {
  if (!Array.isArray(arr)) return undefined
  for (const item of arr as string[]) {
    if (!map) return item as unknown as T
    if (map[item]) return map[item]
  }
  return undefined
}

export function deriveMoodboardDefaults(answers: Answers): DerivedMoodboardDefaults {
  const aesthetic = answers.q10_aesthetic
  const atmosphere = answers.q11_atmosphere

  const mood =
    pickFirst<string>(aesthetic, MOOD_MAP) ??
    pickFirst<string>(atmosphere, MOOD_MAP)

  const style = pickFirst<string>(aesthetic, STYLE_MAP)

  const colour = answers.q13_colours as { desc?: string; hex?: string[] } | undefined
  const palette = colour?.hex && colour.hex.length > 0 ? colour.hex : undefined

  const density = typeof answers.q77_floral_intensity === 'string'
    ? (answers.q77_floral_intensity as string)
    : undefined

  const indoor = answers.q6_indoor
  const venue =
    typeof indoor === 'string' && VENUE_FROM_INDOOR[indoor]
      ? VENUE_FROM_INDOOR[indoor]
      : undefined

  return {
    mood,
    style,
    palette,
    density,
    venue,
    fromQuestionnaire: Boolean(mood || style || palette || density || venue),
  }
}

/** Client explicitly declined florals (or floral intensity is Very Minimal). */
export function florallyAverse(answers: Answers): boolean {
  return answers.q76_florals === 'No' || answers.q77_floral_intensity === 'Very Minimal'
}

/** Client explicitly declined ceiling décor. */
export function noCeilingDecor(answers: Answers): boolean {
  return answers.q46_ceiling === 'No'
}
