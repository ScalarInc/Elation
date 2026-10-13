import type { EventType, ModuleStatus } from '@elation/shared/domain'

// Domain enums now live in @elation/shared; re-exported so existing imports keep working.
export type { EventType, ModuleStatus }

export type UUID = string

export type ClientUser = {
  id: UUID
  name: string
  email: string
  phone?: string
  avatarInitials: string
  accessExpiresAt: string // ISO
  consultant: { id: UUID; name: string; email: string; avatarInitials?: string }
  // Profile extras
  city?: string
  role?: 'Bride' | 'Groom' | 'Family' | 'Organizer'
  partnerName?: string
  emergencyContactName?: string
  emergencyContactPhone?: string
  notifications?: {
    moodboardUpdates: boolean
    budgetAlerts: boolean
    consultantMessages: boolean
    weeklyDigest: boolean
    marketing: boolean
  }
}

export type EventProgress = {
  questionnaire: ModuleStatus
  moodboard: ModuleStatus
  budget: ModuleStatus
  ar: ModuleStatus
}

/** Events come from the API (docs/step-04-events.md). */
export type { EventDto as ClientEvent } from '@elation/shared/api'

/** Shape of the demo events in fixtures.ts (mock mode only). */
export type FixtureEvent = {
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

export type InventoryItem = {
  id: UUID
  name: string
  category:
    | 'Sofa'
    | 'Chair'
    | 'Table'
    | 'Chandelier'
    | 'Floral'
    | 'Backdrop'
    | 'Prop'
    | 'Signage'
    | 'Lighting'
    | 'Fabric'
  colour: string
  material?: string
  pricePKR: number
  unit: 'each' | 'set' | 'linear ft' | 'sqft'
  image: string
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
