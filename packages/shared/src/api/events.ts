import { z } from 'zod'
import { EVENT_TYPES, MODULE_STATUSES, VENUE_SETTINGS } from '../domain/enums'

/**
 * Event contracts (docs/step-04-events.md). Kept close to the original
 * frontend `ClientEvent` mock shape so components change as little as possible.
 */

export const EVENT_STATUSES = ['draft', 'active', 'past', 'archived'] as const
export type EventStatus = (typeof EVENT_STATUSES)[number]

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')

export const eventProgressSchema = z.object({
  questionnaire: z.enum(MODULE_STATUSES),
  moodboard: z.enum(MODULE_STATUSES),
  budget: z.enum(MODULE_STATUSES),
  ar: z.enum(MODULE_STATUSES),
})
export type EventProgress = z.infer<typeof eventProgressSchema>

export const nextStepSchema = z.object({ title: z.string(), body: z.string(), href: z.string() })
export type NextStep = z.infer<typeof nextStepSchema>

export const eventSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  name: z.string(),
  concept: z.string().nullable(),
  type: z.enum(EVENT_TYPES),
  /** Calendar date, YYYY-MM-DD (weddings have no time zone). */
  date: isoDate,
  venue: z.object({ name: z.string(), city: z.string(), indoor: z.enum(VENUE_SETTINGS) }),
  guests: z.number().int(),
  /** Target décor budget; null until the client sets one. */
  budgetPKR: z.number().int().nullable(),
  coverImage: z.string(),
  status: z.enum(EVENT_STATUSES),
  progress: eventProgressSchema,
  questionnairePercent: z.number().int(),
  nextStep: nextStepSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type EventDto = z.infer<typeof eventSchema>

const name = z.string().trim().min(2, 'Give this event a name').max(120)

export const createEventBody = z.object({
  type: z.enum(EVENT_TYPES),
  concept: name,
  date: isoDate,
  guests: z.number().int().min(1, 'At least one guest').max(20_000),
  venueName: z.string().trim().min(2, 'Venue name required').max(160),
  city: z.string().trim().min(2, 'City required').max(80),
  venueSetting: z.enum(VENUE_SETTINGS),
  budgetPkr: z.number().int().min(0).max(2_000_000_000).nullable().optional(),
  /** Staff creating an event on a client's behalf. Ignored for clients. */
  clientId: z.string().uuid().optional(),
})
export type CreateEventBody = z.input<typeof createEventBody>

export const updateEventBody = z
  .object({
    type: z.enum(EVENT_TYPES),
    concept: name,
    date: isoDate,
    guests: z.number().int().min(1).max(20_000),
    venueName: z.string().trim().min(2).max(160),
    city: z.string().trim().min(2).max(80),
    venueSetting: z.enum(VENUE_SETTINGS),
    budgetPkr: z.number().int().min(0).max(2_000_000_000).nullable(),
  })
  .partial()
export type UpdateEventBody = z.input<typeof updateEventBody>

export const EVENT_FILTERS = ['all', 'upcoming', 'draft', 'past', 'archived'] as const
export const EVENT_SORTS = ['date_asc', 'date_desc', 'name'] as const

export const listEventsQuery = z.object({
  status: z.enum(EVENT_FILTERS).default('all'),
  sort: z.enum(EVENT_SORTS).default('date_asc'),
  clientId: z.string().uuid().optional(),
})
export type ListEventsQuery = z.input<typeof listEventsQuery>
