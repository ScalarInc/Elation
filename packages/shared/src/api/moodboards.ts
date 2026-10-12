import { z } from 'zod'
import { EVENT_TYPES } from '../domain/enums'
import { MOODS, STYLES } from '../domain/vocab'
import { inventoryItemSchema } from './inventory'

/** Moodboard contracts (docs/step-07-moodboard.md). */

export const DENSITIES = ['Minimal', 'Moderate', 'Heavy', 'Extremely Floral'] as const
export type Density = (typeof DENSITIES)[number]

export const VENUE_LOOKS = ['Ballroom', 'Garden', 'Terrace', 'Hilltop Outdoor'] as const
export type VenueLook = (typeof VENUE_LOOKS)[number]

const hex = z.string().regex(/^#[0-9a-f]{6}$/i, 'Use #RRGGBB')

/** The "Direct Elation" controls on the moodboard page. */
export const moodboardControlsSchema = z.object({
  mood: z.enum(MOODS),
  style: z.enum(STYLES),
  palette: z.array(hex).max(6),
  density: z.enum(DENSITIES),
  venue: z.enum(VENUE_LOOKS),
  venueLocked: z.boolean(),
})
export type MoodboardControls = z.infer<typeof moodboardControlsSchema>

export const moodboardDefaultsSchema = z.object({
  controls: moodboardControlsSchema,
  /** True when at least one control came from the client's answers. */
  fromQuestionnaire: z.boolean(),
})
export type MoodboardDefaults = z.infer<typeof moodboardDefaultsSchema>

export const MOODBOARD_STATUSES = ['draft', 'saved', 'archived'] as const

export const moodboardTileSchema = z.object({
  id: z.string(),
  position: z.number().int(),
  kind: z.enum(['inventory', 'reference', 'inspiration']),
  area: z.string().nullable(),
  imageUrl: z.string().nullable(),
  item: inventoryItemSchema.nullable(),
  score: z.number().nullable(),
  /** Why Elation chose this piece ("palette: blush", "area: stage" …). */
  reasons: z.array(z.string()),
  locked: z.boolean(),
})
export type MoodboardTileDto = z.infer<typeof moodboardTileSchema>

export const moodboardSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  title: z.string(),
  /** Event type label, for the library's tag. */
  tag: z.enum(EVENT_TYPES),
  cover: z.string().nullable(),
  /** Tile image URLs in order (kept for the existing grid components). */
  tiles: z.array(z.string()),
  palette: z.array(z.string()),
  createdAt: z.string(),
  liked: z.boolean(),
  status: z.enum(MOODBOARD_STATUSES),
  variantLabel: z.string(),
  generationId: z.string(),
  isPrimary: z.boolean(),
  controls: moodboardControlsSchema.nullable(),
  narrative: z.string().nullable(),
  generator: z.string(),
  tileItems: z.array(moodboardTileSchema),
})
export type MoodboardDto = z.infer<typeof moodboardSchema>

export const generateMoodboardBody = z.object({
  /** Omit to use the defaults derived from the questionnaire. */
  controls: moodboardControlsSchema.optional(),
  /** Keep this concept's locked tiles in the new concepts. */
  keepLockedFrom: z.string().uuid().optional(),
})
export type GenerateMoodboardBody = z.infer<typeof generateMoodboardBody>

export const generateMoodboardResponse = z.object({
  generationId: z.string(),
  concepts: z.array(moodboardSchema),
})

export const updateMoodboardBody = z
  .object({ title: z.string().trim().min(1).max(120), liked: z.boolean() })
  .partial()

export const reorderTilesBody = z.object({ tileIds: z.array(z.string().uuid()).min(1).max(40) })

export const updateTileBody = z
  .object({ locked: z.boolean(), inventoryItemId: z.string().uuid() })
  .partial()
  .refine((b) => b.locked !== undefined || b.inventoryItemId !== undefined, 'Nothing to change')

export const tileAlternativeSchema = z.object({
  item: inventoryItemSchema,
  /** Staff only (folds in stock levels). */
  score: z.number().nullable(),
  reasons: z.array(z.string()),
})
export type TileAlternative = z.infer<typeof tileAlternativeSchema>

export const consultBody = z.object({ note: z.string().trim().max(1000).optional() })

export const listMoodboardsQuery = z.object({
  eventId: z.string().uuid().optional(),
  status: z.enum(['saved', 'draft', 'all']).default('saved'),
  liked: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(60),
})
export type ListMoodboardsQuery = z.input<typeof listMoodboardsQuery>
