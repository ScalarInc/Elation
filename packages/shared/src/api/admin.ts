import { z } from 'zod'
import { EVENT_TYPES } from '../domain/enums'
import { email } from './auth'
import { AR_STATUSES } from './ar'
import { BUDGET_TIERS } from './inspirations'

/** Admin & consultant console (docs/step-12-admin.md). All under /api/v1/admin, staff only. */

export const CLIENT_STATUSES = ['invited', 'active', 'expired', 'revoked'] as const
export type ClientStatus = (typeof CLIENT_STATUSES)[number]

const person = z.object({ id: z.string(), name: z.string() })

/** YYYY-MM-DD that is a real calendar date (2026-13-01 is refused). */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((d) => {
    const t = new Date(`${d}T00:00:00Z`)
    return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d
  }, 'Not a real date')

export const adminClientRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  status: z.enum(CLIENT_STATUSES),
  accessExpiresAt: z.string().nullable(),
  lastActiveAt: z.string().nullable(),
  createdAt: z.string(),
  consultant: person.nullable(),
  /** The client's next (or most recent) event. */
  primaryEvent: z.object({ id: z.string(), name: z.string(), type: z.enum(EVENT_TYPES), date: z.string().nullable() }).nullable(),
  eventCount: z.number().int(),
  questionnairePercent: z.number().int(),
  hasOpenQuote: z.boolean(),
})
export type AdminClientRow = z.infer<typeof adminClientRowSchema>

export const listClientsQuery = z.object({
  status: z.enum(CLIENT_STATUSES).optional(),
  consultantId: z.string().uuid().optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(['recent', 'name', 'expiry', 'event']).default('recent'),
  cursor: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})
export type ListClientsQuery = z.infer<typeof listClientsQuery>

export const clientPageSchema = z.object({ rows: z.array(adminClientRowSchema), total: z.number().int(), nextCursor: z.number().int().nullable() })
export type ClientPageDto = z.infer<typeof clientPageSchema>

export const auditEntrySchema = z.object({
  id: z.string(),
  action: z.string(),
  actor: person.nullable(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  at: z.string(),
})
export type AuditEntryDto = z.infer<typeof auditEntrySchema>

export const noteSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  clientName: z.string(),
  eventId: z.string().nullable(),
  author: person,
  body: z.string(),
  followUpAt: z.string().nullable(),
  doneAt: z.string().nullable(),
  createdAt: z.string(),
})
export type NoteDto = z.infer<typeof noteSchema>

export const createNoteBody = z.object({
  body: z.string().trim().min(1).max(4000),
  eventId: z.string().uuid().optional(),
  /** YYYY-MM-DD */
  followUpAt: isoDate.optional(),
})
export const updateNoteBody = z.object({
  body: z.string().trim().min(1).max(4000).optional(),
  followUpAt: isoDate.nullable().optional(),
  done: z.boolean().optional(),
})
export const followUpsQuery = z.object({ due: z.enum(['today', 'overdue', 'week', 'all']).default('week') })

export const adminClientDetailSchema = adminClientRowSchema.extend({
  city: z.string().nullable(),
  partnerName: z.string().nullable(),
  events: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: z.enum(EVENT_TYPES),
      date: z.string().nullable(),
      status: z.string(),
      guests: z.number().int().nullable(),
      questionnairePercent: z.number().int(),
      moodboards: z.number().int(),
      budget: z.object({ totalPkr: z.number().int(), targetPkr: z.number().int(), status: z.string() }).nullable(),
    }),
  ),
  quotes: z.array(z.object({ id: z.string(), eventId: z.string(), eventName: z.string(), status: z.string(), totalPkr: z.number().int(), createdAt: z.string() })),
  notes: z.array(noteSchema),
  threads: z.array(z.object({ id: z.string(), title: z.string(), lastMessageAt: z.string() })),
  access: z.array(auditEntrySchema),
})
export type AdminClientDetail = z.infer<typeof adminClientDetailSchema>

export const extendBody = z
  .object({ days: z.number().int().min(1).max(730).optional(), until: isoDate.optional() })
  .refine((b) => Boolean(b.days) !== Boolean(b.until), { message: 'Give either days or a date' })
export type ExtendBody = z.input<typeof extendBody>

export const revokeBody = z.object({ reason: z.string().trim().min(3).max(500) })

export const updateClientBody = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  /** Admin only: move the client to another consultant. */
  consultantId: z.string().uuid().optional(),
})

export const bulkClientsBody = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  action: z.enum(['extend', 'revoke']),
  days: z.number().int().min(1).max(730).optional(),
  reason: z.string().trim().max(500).optional(),
})
export const bulkResultSchema = z.object({ done: z.array(z.string()), failed: z.array(z.object({ id: z.string(), message: z.string() })) })

// ─────────────── Quotes ───────────────

export const QUOTE_STATUSES = ['open', 'in_review', 'quoted', 'closed'] as const
export const adminQuoteSchema = z.object({
  id: z.string(),
  status: z.enum(QUOTE_STATUSES),
  note: z.string().nullable(),
  totalPkr: z.number().int(),
  targetPkr: z.number().int(),
  lineCount: z.number().int(),
  client: person,
  event: z.object({ id: z.string(), name: z.string(), type: z.enum(EVENT_TYPES), date: z.string().nullable() }),
  handledBy: person.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type AdminQuoteDto = z.infer<typeof adminQuoteSchema>
export const listQuotesQuery = z.object({ status: z.enum(QUOTE_STATUSES).optional() })
export const updateQuoteBody = z.object({ status: z.enum(QUOTE_STATUSES), message: z.string().trim().max(2000).optional() })

// ─────────────── Inquiries ───────────────

export const INQUIRY_STATUSES = ['new', 'contacted', 'converted', 'closed'] as const
export const GUEST_RANGES = ['Under 100', '100–250', '250–500', '500+'] as const

export const publicInquiryBody = z.object({
  name: z.string().trim().min(2).max(120),
  email,
  phone: z.string().trim().max(40).optional(),
  eventType: z.enum(EVENT_TYPES).optional(),
  eventDate: isoDate.optional(),
  guestRange: z.enum(GUEST_RANGES).optional(),
  city: z.string().trim().max(80).optional(),
  budgetBand: z.string().trim().max(60).optional(),
  source: z.string().trim().max(120).optional(),
  message: z.string().trim().max(2000).optional(),
  /** Honeypot: humans leave it empty. */
  website: z.string().max(200).optional(),
})
export type PublicInquiryBody = z.input<typeof publicInquiryBody>

export const inquirySchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  eventType: z.enum(EVENT_TYPES).nullable(),
  eventDate: z.string().nullable(),
  guestRange: z.string().nullable(),
  city: z.string().nullable(),
  budgetBand: z.string().nullable(),
  source: z.string().nullable(),
  message: z.string().nullable(),
  status: z.enum(INQUIRY_STATUSES),
  convertedUserId: z.string().nullable(),
  createdAt: z.string(),
})
export type InquiryDto = z.infer<typeof inquirySchema>
export const listInquiriesQuery = z.object({ status: z.enum(INQUIRY_STATUSES).optional() })
export const updateInquiryBody = z.object({ status: z.enum(['new', 'contacted', 'closed']) })
export const convertInquiryBody = z.object({ consultantId: z.string().uuid().optional(), accessDays: z.number().int().min(1).max(730).optional() })

// ─────────────── Overview & analytics ───────────────

export const analyticsQuery = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  consultantId: z.string().uuid().optional(),
  /** Skip the 5-minute cache ("Refresh"). */
  fresh: z.enum(['true']).optional(),
})
export type AnalyticsQuery = z.input<typeof analyticsQuery>

const countRow = z.object({ label: z.string(), value: z.number() })
export type CountRow = z.infer<typeof countRow>

export const overviewSchema = z.object({
  kpis: z.object({
    activeClients: z.number().int(),
    invitedClients: z.number().int(),
    consultationsThisWeek: z.number().int(),
    moodboardsGenerated: z.number().int(),
    averageTargetBudgetPkr: z.number().int().nullable(),
    openQuotes: z.number().int(),
    newInquiries: z.number().int(),
  }),
  upcomingEvents: z.array(z.object({ id: z.string(), name: z.string(), type: z.enum(EVENT_TYPES), date: z.string(), clientId: z.string(), clientName: z.string() })),
  followUps: z.array(noteSchema),
  recentActivity: z.array(z.object({ id: z.string(), clientId: z.string(), clientName: z.string(), kind: z.string(), title: z.string(), at: z.string() })),
})
export type OverviewDto = z.infer<typeof overviewSchema>

export const analyticsSchema = z.object({
  themes: z.object({ aesthetics: z.array(countRow), atmospheres: z.array(countRow), adoptedInspirations: z.array(countRow), leadMoods: z.array(countRow) }),
  budgets: z.object({ bands: z.array(countRow), targets: z.array(countRow), lights: z.array(countRow) }),
  eventTypes: z.array(z.object({ month: z.string(), type: z.string(), value: z.number() })),
  funnel: z.array(countRow),
  inventory: z.array(z.object({ label: z.string(), sku: z.string(), moodboards: z.number(), budgets: z.number() })),
})
export type AnalyticsDto = z.infer<typeof analyticsSchema>
export const ANALYTICS_REPORTS = ['themes', 'budgets', 'event-types', 'funnel', 'inventory'] as const

// ─────────────── CMS: inspirations & AR ───────────────

export const adminInspirationSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  eventTypes: z.array(z.enum(EVENT_TYPES)),
  style: z.string(),
  palette: z.array(z.string()),
  coverUrl: z.string(),
  summary: z.string(),
  featured: z.boolean(),
  budgetTier: z.enum(BUDGET_TIERS).nullable(),
  published: z.boolean(),
  tiles: z.array(z.object({ id: z.string(), imageUrl: z.string(), caption: z.string().nullable() })),
  items: z.array(z.object({ id: z.string(), inventoryItemId: z.string(), name: z.string(), sku: z.string(), category: z.string(), qtyPer100Guests: z.number().int().nullable(), qtyFixed: z.number().int().nullable() })),
  adoptions: z.number().int(),
  updatedAt: z.string(),
})
export type AdminInspirationDto = z.infer<typeof adminInspirationSchema>

const hex = z.string().regex(/^#[0-9a-f]{6}$/i)
/** An https link or a path on this site (/media/…, signed storage links) — never javascript: or http:. */
const url = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .refine((u) => /^https:\/\//i.test(u) || (u.startsWith('/') && !u.startsWith('//')), 'Use an https link or upload the image')

export const inspirationWriteBody = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lower-case words joined by dashes').max(80).optional(),
  eventTypes: z.array(z.enum(EVENT_TYPES)).min(1),
  style: z.string().trim().min(2).max(120),
  palette: z.array(hex).max(8),
  coverUrl: url,
  summary: z.string().trim().min(2).max(2000),
  featured: z.boolean().default(false),
  budgetTier: z.enum(BUDGET_TIERS).nullable().default(null),
  tiles: z.array(z.object({ imageUrl: url, caption: z.string().trim().max(200).nullable().optional() })).max(24),
  items: z
    .array(
      z.object({
        inventoryItemId: z.string().uuid(),
        category: z.string().trim().min(1).max(60),
        qtyPer100Guests: z.number().int().min(1).max(10000).nullable().optional(),
        qtyFixed: z.number().int().min(1).max(10000).nullable().optional(),
      }),
    )
    .max(80),
})
export type InspirationWriteBody = z.input<typeof inspirationWriteBody>

export const adminArSetSchema = z.object({
  id: z.string(),
  eventId: z.string().nullable(),
  eventName: z.string().nullable(),
  clientName: z.string().nullable(),
  eventType: z.enum(EVENT_TYPES),
  title: z.string(),
  theme: z.string(),
  status: z.enum(AR_STATUSES),
  progressPercent: z.number().int(),
  eta: z.string().nullable(),
  coverUrl: z.string(),
  summary: z.string(),
  highlights: z.array(z.string()),
  notifyCount: z.number().int(),
  assets: z.array(z.object({ id: z.string(), name: z.string(), source: z.string().nullable(), modelFileId: z.string().nullable(), modelFilename: z.string().nullable() })),
  updatedAt: z.string(),
})
export type AdminArSetDto = z.infer<typeof adminArSetSchema>

export const arSetWriteBody = z.object({
  eventId: z.string().uuid().nullable().optional(),
  eventType: z.enum(EVENT_TYPES),
  title: z.string().trim().min(2).max(120),
  theme: z.string().trim().min(2).max(120),
  coverUrl: url,
  summary: z.string().trim().max(2000).default(''),
  highlights: z.array(z.string().trim().min(1).max(120)).max(8).default([]),
})
export const arStatusBody = z.object({
  status: z.enum(AR_STATUSES),
  progressPercent: z.number().int().min(0).max(100),
  eta: isoDate.nullable().optional(),
})
export const arAssetWriteBody = z.object({
  name: z.string().trim().min(1).max(120),
  source: z.enum(['Tripo AI', 'Meshy AI', 'manual']).default('manual'),
  modelFileId: z.string().uuid().nullable().optional(),
  inventoryItemId: z.string().uuid().nullable().optional(),
})

// ─────────────── Team & settings ───────────────

export const teamMemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.enum(['consultant', 'admin']),
  status: z.enum(CLIENT_STATUSES),
  clientCount: z.number().int(),
  lastActiveAt: z.string().nullable(),
})
export type TeamMemberDto = z.infer<typeof teamMemberSchema>
export const inviteStaffBody = z.object({ name: z.string().trim().min(2).max(120), email, role: z.enum(['consultant', 'admin']) })
export const updateStaffBody = z.object({
  role: z.enum(['consultant', 'admin']).optional(),
  active: z.boolean().optional(),
  /** Move every client of this person to another consultant. */
  reassignClientsTo: z.string().uuid().optional(),
})

export const settingsSchema = z.object({
  defaultAccessDays: z.number().int().min(7).max(730),
  /** Largest extension a consultant may give at once; larger ones and revocations are admin-only. */
  consultantMaxExtendDays: z.number().int().min(1).max(365),
  /** Shown in the invite email, under the greeting. */
  inviteIntro: z.string().trim().max(600),
})
export type SettingsDto = z.infer<typeof settingsSchema>
export const updateSettingsBody = settingsSchema.partial()
