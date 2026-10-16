export type UUID = string

export const EVENT_TYPES = [
  'Mehndi', 'Mayoun', 'Baraat', 'Walima', 'Nikkah', 'Engagement', 'Birthday', 'Corporate Event', 'Milad',
  'Qawwali', 'Dinner', 'Bridal Shower', 'Baby Shower', 'Anniversary', 'Other',
] as const

export type EventType = (typeof EVENT_TYPES)[number]

export type ModuleStatus = 'complete' | 'in_progress' | 'pending'

export type ClientRole = 'Bride' | 'Groom' | 'Family' | 'Organizer'

/** The signed-in user, as returned by GET /api/me. Admins and clients share this shape. */
export type ClientUser = {
  id: UUID
  role: 'admin' | 'client'
  isSuperuser: boolean
  name: string
  email: string
  avatarInitials: string
  phone: string | null
  city: string | null
  clientRole: ClientRole | null
  partnerName: string | null
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  /** ISO timestamp; null for admins (no expiry). */
  accessExpiresAt: string | null
  /** Assigned Elation consultant (an admin); null until one is assigned. */
  consultant: { id: UUID; name: string; email: string; avatarInitials: string } | null
  notifications: Partial<{
    moodboardUpdates: boolean
    budgetAlerts: boolean
    consultantMessages: boolean
    weeklyDigest: boolean
    marketing: boolean
  }>
}

/** Body of PATCH /api/me. */
export type ProfileUpdate = {
  name: string
  phone?: string | null
  city?: string | null
  clientRole?: ClientRole | null
  partnerName?: string | null
  emergencyContactName?: string | null
  emergencyContactPhone?: string | null
}

export type EventProgress = {
  questionnaire: ModuleStatus
  moodboard: ModuleStatus
  budget: ModuleStatus
  ar: ModuleStatus
}

export type ClientEvent = {
  id: UUID
  clientId: UUID
  name: string
  type: EventType
  concept: string | null
  date: string // ISO
  venue: { name: string; city: string; indoor: 'Indoor' | 'Outdoor' | 'Both' }
  guests: number
  /** Target budget; null until the client sets one (questionnaire or budget page). */
  budgetPkr: number | null
  /** Always set: the API layer falls back to a brand image when the event has no cover. */
  coverImage: string
  progress: EventProgress
  status: 'draft' | 'active' | 'past'
}

/** Body of POST /api/events. */
export type EventCreateInput = {
  name: string
  type: EventType
  date: string // yyyy-mm-dd
  venueName: string
  city: string
  guests: number
}

/** Saved questionnaire state for one event (GET/PUT /api/events/:id/questionnaire). */
export type QuestionnaireData = {
  answers: Record<string, unknown>
  elationDecides: Record<string, boolean>
  percent: number
  updatedAt: string | null
}

/** One recommended inventory item on a moodboard. */
export type MoodboardItem = {
  item: InventoryItem
  suggestedQty: number | null
  /** Budget bucket used when the moodboard becomes a budget, e.g. "Stage". */
  budgetCategory: string | null
  reason: string | null
}

export type Moodboard = {
  id: UUID
  eventId: UUID
  title: string
  summary: string | null
  /** The event's type. */
  tag: EventType
  /** Preview image: first item photo, or a brand image when items have no photos yet. */
  cover: string
  /** Item photos for preview grids (falls back to `cover`). */
  tiles: string[]
  palette: string[]
  mood: string | null
  style: string | null
  density: string | null
  venue: string | null
  /** "ai" = Groq, "rules" = built-in fallback, "inspiration" = adopted concept. */
  source: 'ai' | 'rules' | 'inspiration'
  createdAt: string
  liked: boolean
  items: MoodboardItem[]
}

/** Direction controls sent when generating a new concept. */
export type MoodboardControls = { mood?: string; style?: string; density?: string; venue?: string }

export const INVENTORY_CATEGORIES = [
  'Sofa', 'Chair', 'Table', 'Chandelier', 'Floral', 'Backdrop', 'Prop', 'Signage', 'Lighting', 'Fabric', 'Structure',
] as const
export const INVENTORY_UNITS = ['each', 'set', 'linear ft', 'sqft'] as const

/** An inventory item as returned by GET /api/inventory. Prices are live from the database. */
export type InventoryItem = {
  id: UUID
  name: string
  category: (typeof INVENTORY_CATEGORIES)[number]
  colour: string | null
  material: string | null
  pricePkr: number
  unit: (typeof INVENTORY_UNITS)[number]
  imageUrl: string | null
  tags: string[]
}

export type BudgetLine = {
  /** Client-generated UUID; stays stable across saves. */
  id: UUID
  /** Budget bucket, e.g. "Stage" or "Seating". */
  category: string
  itemId: UUID
  qty: number
  included: boolean
}

export type BudgetStatus = 'green' | 'yellow' | 'red' | 'noTarget'

/** GET/PUT /api/events/:id/budget, mapped by the API layer. */
export type BudgetSnapshot = {
  eventId: UUID
  /** Target budget; null when not set. */
  budgetPkr: number | null
  lines: BudgetLine[]
  /** Every item the lines reference, including archived ones (not in the public catalogue). */
  items: InventoryItem[]
  /** Server-computed totals using the latest saved prices. */
  totals: { totalPkr: number; deltaPkr: number | null; status: BudgetStatus }
}

/** A frozen quote: prices, quantities and totals as they were when requested. */
export type QuoteRequest = {
  id: UUID
  eventId: UUID
  status: 'new' | 'contacted' | 'closed'
  totalPkr: number
  targetBudgetPkr: number | null
  budgetStatus: BudgetStatus
  clientNote: string | null
  createdAt: string
}

export type Inspiration = {
  id: UUID
  slug: string
  name: string
  eventTypes: EventType[]
  /** Style tags joined with " · " for display, e.g. "Regal · Modern Luxury". */
  style: string
  styleTags: string[]
  palette: string[]
  /** Cover photo, or a brand image when none is uploaded yet. */
  cover: string
  /** Gallery photos (falls back to the cover). */
  tiles: string[]
  summary: string
  featured: boolean
  budgetTier: 'Intimate' | 'Signature' | 'Grand' | null
  /** Inventory the concept uses; carried into the moodboard and budget when adopted. */
  items: { item: InventoryItem; quantity: number }[]
}

/** A concept ranked for one event (GET /api/events/:id/inspiration-recommendations). */
export type RecommendedInspiration = { inspiration: Inspiration; reason: string; estimatedCostPkr: number }

/** One message in a client's thread. Admins appear to clients as their Elation consultant. */
export type Message = {
  id: UUID
  /** The client whose thread this belongs to (one thread per client). */
  clientId: UUID
  senderId: UUID | null
  senderRole: 'client' | 'admin'
  senderName: string
  body: string
  createdAt: string
}

export type ARSet = {
  id: UUID
  eventId?: UUID
  eventType: EventType
  title: string
  theme: string
  status: 'ready' | 'rendering' | 'coming-soon'
  progressPercent: number
  eta?: string
  coverImage: string
  floorPlan: string
  aerialViews: string[]
  assetCount: number
  summary: string
  highlights: string[]
}

export type ActivityEntry = {
  id: UUID
  eventId?: UUID
  kind: 'moodboard' | 'budget' | 'note' | 'system' | 'ar'
  title: string
  detail?: string
  at: string
}

export type AnalyticsPoint = { label: string; value: number }

export type NextStep = {
  title: string
  body: string
  href: string
}
