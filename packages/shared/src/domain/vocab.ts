/**
 * Controlled vocabularies for inventory tags (docs/step-06-inventory.md).
 * The moodboard engine (Step 7) matches questionnaire answers against these,
 * so the importer rejects anything outside them.
 */

/** Where in the venue an item is used — aligned with questionnaire Q9 "Which areas need décor?". */
export const INVENTORY_AREAS = [
  'entrance',
  'stage',
  'ceiling',
  'dining',
  'lounge',
  'floor-seating',
  'photo-area',
  'dance-floor',
  'walkway',
  'walls',
] as const
export type InventoryArea = (typeof INVENTORY_AREAS)[number]

/** Moods — the moodboard "Mood" control. */
export const MOODS = ['romantic', 'regal', 'dramatic', 'serene', 'whimsical', 'bohemian'] as const
export type Mood = (typeof MOODS)[number]

/** Styles — the moodboard "Style" control. */
export const STYLES = ['modern-luxury', 'traditional', 'garden', 'editorial', 'architectural'] as const
export type Style = (typeof STYLES)[number]

export const MOOD_LABELS: Record<Mood, string> = {
  romantic: 'Romantic',
  regal: 'Regal',
  dramatic: 'Dramatic',
  serene: 'Serene',
  whimsical: 'Whimsical',
  bohemian: 'Bohemian',
}

export const STYLE_LABELS: Record<Style, string> = {
  'modern-luxury': 'Modern Luxury',
  traditional: 'Traditional',
  garden: 'Garden',
  editorial: 'Editorial',
  architectural: 'Architectural',
}
