import { z } from 'zod'
import { EVENT_TYPES } from '../domain/enums'
import { inventoryItemSchema } from './inventory'

/** Inspiration gallery contracts (docs/step-09-inspirations-ar.md). */

export const BUDGET_TIERS = ['Intimate', 'Signature', 'Grand'] as const

export const inspirationSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  eventTypes: z.array(z.enum(EVENT_TYPES)),
  /** "Romantic · Modern Luxury" */
  style: z.string(),
  palette: z.array(z.string()),
  cover: z.string(),
  /** Gallery images. */
  tiles: z.array(z.string()),
  summary: z.string(),
  featured: z.boolean(),
  budgetTier: z.enum(BUDGET_TIERS).nullable(),
})
export type InspirationDto = z.infer<typeof inspirationSchema>

export const inspirationItemSchema = z.object({
  item: inventoryItemSchema,
  category: z.string(),
  qtyPer100Guests: z.number().int().nullable(),
  qtyFixed: z.number().int().nullable(),
})

export const inspirationDetailSchema = inspirationSchema.extend({
  items: z.array(inspirationItemSchema),
  /** Priced pieces for a 200-guest event — "from PKR …". */
  indicativeTotalPkr: z.number().int(),
})
export type InspirationDetailDto = z.infer<typeof inspirationDetailSchema>

export const listInspirationsQuery = z.object({
  eventType: z.enum(EVENT_TYPES).optional(),
  /** One style word, e.g. "Romantic". */
  style: z.string().trim().max(40).optional(),
  tier: z.enum(BUDGET_TIERS).optional(),
  palette: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  q: z.string().trim().max(100).optional(),
})
export type ListInspirationsQuery = z.input<typeof listInspirationsQuery>

export const ADOPT_MODES = ['replace', 'merge'] as const

export const adoptInspirationBody = z.object({
  eventId: z.string().uuid(),
  /** Only matters when the event already has a budget: swap its lines, or add what's missing. */
  mode: z.enum(ADOPT_MODES).default('merge'),
})
export type AdoptInspirationBody = z.input<typeof adoptInspirationBody>

export const adoptInspirationResponse = z.object({
  moodboardId: z.string(),
  budgetPlanId: z.string(),
  /** Pieces in the concept that are priced on request (not added to the budget). */
  unpricedItems: z.array(z.object({ id: z.string(), name: z.string() })),
  /** Questionnaire answers that were empty and got filled from the concept. */
  prefilled: z.array(z.string()),
})
export type AdoptInspirationResponse = z.infer<typeof adoptInspirationResponse>
