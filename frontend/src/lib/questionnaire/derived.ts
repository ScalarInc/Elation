import type { ClientEvent, EventType } from '@/types'
import type { Answers } from '@/stores/questionnaireStore'

const EVENT_TYPES: EventType[] = [
  'Mehndi', 'Mayoun', 'Baraat', 'Walima', 'Nikkah', 'Engagement', 'Birthday',
  'Corporate Event', 'Milad', 'Qawwali', 'Dinner', 'Bridal Shower',
  'Baby Shower', 'Anniversary', 'Other',
]

const BUDGET_MIDPOINTS: Record<string, number> = {
  'Under PKR 250,000': 200_000,
  'PKR 250,000–500,000': 375_000,
  'PKR 500,000–1M': 750_000,
  'PKR 1M–2M': 1_500_000,
  'PKR 2M–5M': 3_500_000,
  'PKR 5M+': 7_500_000,
}

/** Apply questionnaire overrides onto the fixture event. Pure. */
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
      typeof date === 'string' && date.length > 0
        ? new Date(date).toISOString()
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
    budgetPkr:
      typeof budgetBand === 'string' && BUDGET_MIDPOINTS[budgetBand] != null
        ? BUDGET_MIDPOINTS[budgetBand]
        : base.budgetPkr,
  }
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
