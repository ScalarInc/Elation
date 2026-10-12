import { z } from 'zod'
import { eventSchema } from './events'
import { inventoryItemSchema } from './inventory'

/** Budget estimator contracts (docs/step-08-budget.md). */

export const BUDGET_STATUSES = ['draft', 'submitted', 'quoted'] as const
export const BUDGET_SEEDS = ['rules', 'moodboard', 'inspiration', 'blank', 'fixture'] as const
export const BUDGET_LINE_SOURCES = ['seed', 'client', 'consultant', 'moodboard', 'inspiration'] as const

export const MAX_BUDGET_LINES = 200
export const MAX_LINE_QTY = 10_000

const pkr = z.number().int().min(0).max(2_000_000_000)

export const budgetClassificationSchema = z.object({
  state: z.enum(['green', 'yellow', 'red']),
  ratio: z.number(),
  deltaPkr: z.number().int(),
})

export const budgetTotalsSchema = z.object({
  includedPkr: z.number().int(),
  byCategory: z.array(z.object({ category: z.string(), totalPkr: z.number().int(), count: z.number().int() })),
})

export const budgetLineSchema = z.object({
  id: z.string(),
  category: z.string(),
  qty: z.number().int(),
  included: z.boolean(),
  position: z.number().int(),
  source: z.enum(BUDGET_LINE_SOURCES),
  /** Price when the line was added (decision P7). Totals use this. */
  unitPricePkr: z.number().int(),
  /** Today's inventory price; null if Elation has since unpriced the piece. */
  currentPricePkr: z.number().int().nullable(),
  item: inventoryItemSchema,
})
export type BudgetLineDto = z.infer<typeof budgetLineSchema>

export const budgetPlanSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  targetPkr: z.number().int(),
  status: z.enum(BUDGET_STATUSES),
  seededFrom: z.enum(BUDGET_SEEDS),
  version: z.number().int(),
  lines: z.array(budgetLineSchema),
  totals: budgetTotalsSchema,
  classification: budgetClassificationSchema,
  /** Some line's snapshot differs from today's price → "prices updated" banner + reprice. */
  pricesChanged: z.boolean(),
  /** Lines changed since the last quote request. */
  changedSinceQuote: z.boolean(),
  submittedAt: z.string().nullable(),
  updatedAt: z.string(),
})
export type BudgetPlanDto = z.infer<typeof budgetPlanSchema>

export const eventBudgetResponse = z.object({
  plan: budgetPlanSchema.nullable(),
  suggestedTargetPkr: z.number().int(),
  /** Whether "Start from my moodboard" can be offered. */
  hasMoodboard: z.boolean(),
})
export type EventBudgetResponse = z.infer<typeof eventBudgetResponse>

export const budgetSummarySchema = z.object({
  event: eventSchema,
  plan: z
    .object({
      targetPkr: z.number().int(),
      status: z.enum(BUDGET_STATUSES),
      totals: budgetTotalsSchema,
      classification: budgetClassificationSchema,
      lineCount: z.number().int(),
    })
    .nullable(),
})
export type BudgetSummary = z.infer<typeof budgetSummarySchema>

export const createBudgetBody = z.object({
  seedFrom: z.enum(['moodboard', 'rules', 'blank']),
  moodboardId: z.string().uuid().optional(),
  targetPkr: pkr.optional(),
})
export type CreateBudgetBody = z.input<typeof createBudgetBody>

/** Result of a seed: pieces from the moodboard that couldn't be added because they're not priced yet. */
export const seededBudgetResponse = z.object({
  plan: budgetPlanSchema,
  unpricedItems: z.array(z.object({ id: z.string(), name: z.string() })),
})
export type SeededBudgetResponse = z.infer<typeof seededBudgetResponse>

export const putBudgetBody = z.object({
  version: z.number().int().min(1),
  targetPkr: pkr,
  lines: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        inventoryItemId: z.string().uuid(),
        category: z.string().trim().min(1).max(40),
        qty: z.number().int().min(1).max(MAX_LINE_QTY),
        included: z.boolean(),
      }),
    )
    .max(MAX_BUDGET_LINES)
    .refine((lines) => new Set(lines.flatMap((l) => (l.id ? [l.id] : []))).size === lines.filter((l) => l.id).length, 'Each line can appear only once')
    .refine((lines) => new Set(lines.map((l) => l.inventoryItemId)).size === lines.length, 'Each piece can appear only once — change its quantity instead'),
})
export type PutBudgetBody = z.input<typeof putBudgetBody>

export const addBudgetLineBody = z.object({
  inventoryItemId: z.string().uuid(),
  category: z.string().trim().min(1).max(40).optional(),
  qty: z.number().int().min(1).max(MAX_LINE_QTY).optional(),
  /** Where the piece sits on the moodboard (picks the group and starter quantity). */
  area: z.string().max(40).optional(),
  source: z.enum(['client', 'moodboard', 'inspiration']).default('client'),
})
export type AddBudgetLineBody = z.input<typeof addBudgetLineBody>

export const budgetNoteBody = z.object({ note: z.string().trim().max(1000).optional() })

export const quoteSchema = z.object({
  id: z.string(),
  status: z.enum(['open', 'in_review', 'quoted', 'closed']),
  note: z.string().nullable(),
  totalPkr: z.number().int(),
  lineCount: z.number().int(),
  createdAt: z.string(),
})
export type QuoteDto = z.infer<typeof quoteSchema>

export const applyToBudgetResponse = z.object({
  plan: budgetPlanSchema,
  added: z.number().int(),
  unpricedItems: z.array(z.object({ id: z.string(), name: z.string() })),
})
export type ApplyToBudgetResponse = z.infer<typeof applyToBudgetResponse>
