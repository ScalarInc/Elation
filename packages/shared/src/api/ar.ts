import { z } from 'zod'
import { EVENT_TYPES } from '../domain/enums'

/** AR sets (docs/step-09-inspirations-ar.md). The Quest app itself is a separate build. */

export const AR_STATUSES = ['ready', 'rendering', 'coming-soon'] as const
export type ArStatus = (typeof AR_STATUSES)[number]

export const arSetSchema = z.object({
  id: z.string(),
  /** null for Elation's showcase sets. */
  eventId: z.string().nullable(),
  eventType: z.enum(EVENT_TYPES),
  title: z.string(),
  theme: z.string(),
  status: z.enum(AR_STATUSES),
  progressPercent: z.number().int(),
  /** YYYY-MM-DD */
  eta: z.string().nullable(),
  coverImage: z.string(),
  floorPlan: z.string().nullable(),
  aerialViews: z.array(z.string()),
  assetCount: z.number().int(),
  summary: z.string(),
  highlights: z.array(z.string()),
  /** The viewer asked to hear when this set is ready. */
  notifyRequested: z.boolean(),
})
export type ArSetDto = z.infer<typeof arSetSchema>

export const eventArResponse = z.object({
  set: arSetSchema.nullable(),
  /** When the event has no set yet: a showcase set of the same event type. */
  showcase: arSetSchema.nullable(),
})
export type EventArResponse = z.infer<typeof eventArResponse>

export const arAssetSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  source: z.string().nullable(),
  /** Expiring link to the GLB/OBJ; null until Elation uploads the model (file storage, Step 11). */
  downloadUrl: z.string().nullable(),
})
export type ArAssetDto = z.infer<typeof arAssetSchema>

export const arSessionRequestBody = z.object({
  /** YYYY-MM-DD the client would prefer. */
  preferredDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  note: z.string().trim().max(1000).optional(),
})
export type ArSessionRequestBody = z.input<typeof arSessionRequestBody>
