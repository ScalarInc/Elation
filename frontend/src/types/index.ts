export type UUID = string

export type EventType =
  | 'Mehndi'
  | 'Mayoun'
  | 'Baraat'
  | 'Walima'
  | 'Nikkah'
  | 'Engagement'
  | 'Birthday'
  | 'Corporate Event'
  | 'Milad'
  | 'Qawwali'
  | 'Dinner'
  | 'Bridal Shower'
  | 'Baby Shower'
  | 'Anniversary'
  | 'Other'

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
  concept?: string
  date: string // ISO
  venue: { name: string; city: string; indoor: 'Indoor' | 'Outdoor' | 'Both' }
  guests: number
  budgetPKR: number
  coverImage: string
  progress: EventProgress
  status: 'draft' | 'active' | 'past'
}

export type Moodboard = {
  id: UUID
  eventId: UUID
  title: string
  tag: EventType
  cover: string
  tiles: string[]
  palette: string[]
  createdAt: string
  liked: boolean
}

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
  id: UUID
  category: string
  itemId: UUID
  qty: number
  included: boolean
}

export type BudgetSnapshot = {
  eventId: UUID
  budgetPKR: number
  lines: BudgetLine[]
}

export type Inspiration = {
  id: UUID
  slug: string
  name: string
  eventTypes: EventType[]
  style: string
  palette: string[]
  cover: string
  tiles: string[]
  summary: string
  featured?: boolean
  budgetTier?: 'Intimate' | 'Signature' | 'Grand'
}

export type Message = {
  id: UUID
  authorId: UUID
  authorName: string
  authorRole: 'client' | 'consultant' | 'system'
  body: string
  createdAt: string
  attachments?: { name: string; url: string }[]
  read?: boolean
}

export type MessageThread = {
  id: UUID
  eventId?: UUID
  title: string
  participants: { id: UUID; name: string; role: 'client' | 'consultant'; avatarInitials: string }[]
  lastMessageAt: string
  unread: number
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
