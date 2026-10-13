import type { MoodboardControls, MoodboardDefaults, VenueLook } from '../api/moodboards'
import type { Mood, Style } from '../domain/vocab'
import type { Answers } from '../questionnaire/types'
import { visibleAnswers } from '../questionnaire/validate'

/**
 * Questionnaire answers → the moodboard's starting controls
 * (moved from the webapp so the server curates from the same reading).
 */

/** Q10 aesthetic / Q11 atmosphere options → moods. */
export const MOOD_FROM_ANSWER: Record<string, Mood> = {
  Romantic: 'romantic',
  Soft: 'romantic',
  Intimate: 'romantic',
  'Warm & Intimate': 'romantic',
  Regal: 'regal',
  Luxury: 'regal',
  Grand: 'regal',
  Luxurious: 'regal',
  Elegant: 'regal',
  Sophisticated: 'regal',
  Dramatic: 'dramatic',
  Moody: 'dramatic',
  'Sacred/Serene': 'serene',
  Minimalistic: 'serene',
  Dreamy: 'whimsical',
  Whimsical: 'whimsical',
  Playful: 'whimsical',
  'Bright & Joyful': 'whimsical',
  Vibrant: 'bohemian',
  Bohemian: 'bohemian',
  Rustic: 'bohemian',
  Artistic: 'bohemian',
}

/** Q10 aesthetic options → styles. */
export const STYLE_FROM_ANSWER: Record<string, Style> = {
  Modern: 'modern-luxury',
  'Modern Luxury': 'modern-luxury',
  Luxury: 'modern-luxury',
  Contemporary: 'modern-luxury',
  Minimalistic: 'modern-luxury',
  Elegant: 'modern-luxury',
  Traditional: 'traditional',
  Regal: 'traditional',
  Grand: 'traditional',
  Bohemian: 'editorial',
  Artistic: 'editorial',
  Whimsical: 'editorial',
  Architectural: 'architectural',
  Organic: 'garden',
  Rustic: 'garden',
  Romantic: 'garden',
  Soft: 'garden',
}

const VENUE_FROM_SETTING: Record<string, VenueLook> = {
  Indoor: 'Ballroom',
  Outdoor: 'Hilltop Outdoor',
  Both: 'Terrace',
}

const DENSITY_FROM_ANSWER: Record<string, MoodboardControls['density']> = {
  'Very Minimal': 'Minimal',
  Moderate: 'Moderate',
  Heavy: 'Heavy',
  'Extremely Floral': 'Extremely Floral',
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

/** Moods implied by Q10 + Q11, strongest (most mentioned) first. */
export function moodsFromAnswers(answers: Answers): Mood[] {
  const counts = new Map<Mood, number>()
  for (const option of [...strings(answers.q10_aesthetic), ...strings(answers.q11_atmosphere)]) {
    const mood = MOOD_FROM_ANSWER[option]
    if (mood) counts.set(mood, (counts.get(mood) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m)
}

/** Styles implied by Q10, in answer order. */
export function stylesFromAnswers(answers: Answers): Style[] {
  const out: Style[] = []
  for (const option of strings(answers.q10_aesthetic)) {
    const style = STYLE_FROM_ANSWER[option]
    if (style && !out.includes(style)) out.push(style)
  }
  return out
}

/** Hex colours the client chose in Q16. */
export function paletteFromAnswers(answers: Answers): string[] {
  const colours = answers.q16_colours as { hex?: unknown } | undefined
  return strings(colours?.hex).filter((h) => /^#[0-9a-f]{6}$/i.test(h)).slice(0, 6)
}

/** Client said no to florals (or wants them very minimal). */
export function florallyAverse(answers: Answers): boolean {
  return answers.q76_florals === 'No' || answers.q77_floral_intensity === 'Very Minimal'
}

/** Client said no to ceiling décor. */
export function noCeilingDecor(answers: Answers): boolean {
  return answers.q46_ceiling === 'No'
}

/** Elation's brand palette — used when the client hasn't chosen colours. */
export const BRAND_PALETTE = ['#E3BFB9', '#9AB1AE', '#E1CBAD', '#FAF3EF']

export function deriveMoodboardDefaults(rawAnswers: Answers): MoodboardDefaults {
  const answers = visibleAnswers(rawAnswers)
  const moods = moodsFromAnswers(answers)
  const styles = stylesFromAnswers(answers)
  const palette = paletteFromAnswers(answers)
  const density =
    answers.q76_florals === 'No'
      ? 'Minimal'
      : DENSITY_FROM_ANSWER[String(answers.q77_floral_intensity)]
  const venue = VENUE_FROM_SETTING[String(answers.q6_indoor)]

  return {
    controls: {
      mood: moods[0] ?? 'romantic',
      style: styles[0] ?? 'modern-luxury',
      palette: palette.length ? palette : BRAND_PALETTE,
      density: density ?? 'Moderate',
      venue: venue ?? 'Ballroom',
      venueLocked: true,
    },
    fromQuestionnaire: Boolean(moods.length || styles.length || palette.length || density || venue),
  }
}
