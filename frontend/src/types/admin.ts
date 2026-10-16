import type { EventProgress, EventType, InventoryItem, Message, UUID } from '@/types'

/** Types for the admin console API (/api/admin/*). */

export type AdminSummary = { id: UUID; name: string; email: string; avatarInitials: string }

export type ClientStatus = 'pending' | 'active' | 'expired' | 'revoked'

export type AdminClient = {
  id: UUID
  name: string
  email: string
  avatarInitials: string
  phone: string | null
  city: string | null
  /** Derived: revoked > expired > pending (invite not accepted) > active. */
  status: ClientStatus
  accessStatus: 'active' | 'revoked'
  accessExpiresAt: string
  invitationStatus: 'pending' | 'accepted'
  invitedAt: string | null
  activatedAt: string | null
  createdAt: string
  consultant: AdminSummary | null
  eventCount: number
}

export type ClientCreateInput = {
  name: string
  email: string
  phone?: string
  city?: string
  /** Defaults to CLIENT_ACCESS_DEFAULT_DAYS (30) on the server. */
  accessDays?: number
}

export type ClientUpdateInput = Partial<{
  name: string
  phone: string | null
  city: string | null
  accessExpiresAt: string
  accessStatus: 'active' | 'revoked'
  consultantId: UUID | null
}>

/** Returned when creating a client or re-sending an invite. */
export type InviteResult = {
  client: AdminClient
  /** One-time set-password link; admins can copy it if the email didn't arrive. */
  inviteLink: string
  emailSent: boolean
  emailError: string | null
}


/** Inventory item as seen by admins (includes archived items and audit fields). */
export type AdminInventoryItem = InventoryItem & {
  stockQty: number | null
  isActive: boolean
  /** True until an admin first sets the price; seed prices are estimates. */
  isProvisionalPrice: boolean
  priceUpdatedAt: string | null
  updatedAt: string
}

export type InventoryItemInput = {
  name: string
  category: InventoryItem['category']
  unit: InventoryItem['unit']
  pricePkr: number
  colour?: string | null
  material?: string | null
  stockQty?: number | null
  tags?: string[]
}

export type InventoryItemUpdate = Partial<InventoryItemInput & { isActive: boolean }>

export type PriceChange = { oldPricePkr: number; newPricePkr: number; changedByName: string | null; changedAt: string }

/** Inspiration concept as seen by admins (includes drafts). */
export type AdminInspiration = {
  id: UUID
  slug: string
  name: string
  summary: string | null
  styleTags: string[]
  eventTypes: EventType[]
  palette: string[]
  budgetTier: 'Intimate' | 'Signature' | 'Grand' | null
  coverUrl: string | null
  imageUrls: string[]
  /** Storage paths matching `imageUrls`, used to remove a gallery image. */
  imagePaths: string[]
  isFeatured: boolean
  isPublished: boolean
  items: { item: InventoryItem; quantity: number }[]
  updatedAt: string
}

export type InspirationInput = {
  name: string
  summary?: string | null
  styleTags?: string[]
  eventTypes?: EventType[]
  palette?: string[]
  budgetTier?: AdminInspiration['budgetTier']
  isFeatured?: boolean
  isPublished?: boolean
}

/** A client's thread in the admin inbox. */
export type Conversation = {
  clientId: UUID
  clientName: string
  clientEmail: string
  avatarInitials: string
  lastMessage: Message | null
  messageCount: number
}


export type ChartPoint = { label: string; value: number }

export type AdminOverview = {
  activeClients: number
  pendingInvites: number
  /** Active clients whose access ends within 7 days. */
  expiringSoon: number
  events: number
  moodboardsThisWeek: number
  openQuotes: number
  /** Follow-ups due by tomorrow and not yet done. */
  followUpsDue: number
}

export type AdminAnalytics = {
  eventsByType: ChartPoint[]
  budgetRanges: ChartPoint[]
  popularStyles: ChartPoint[]
  moodboardsPerWeek: ChartPoint[]
  quotesPerWeek: ChartPoint[]
  quotesByStatus: ChartPoint[]
}

export type QuoteStatus = 'new' | 'contacted' | 'closed'

export type ConsultationQuote = {
  id: UUID
  eventId: UUID
  eventName: string
  status: QuoteStatus
  totalPkr: number
  budgetStatus: string
  itemCount: number
  clientNote: string | null
  createdAt: string
}

export type Consultation = {
  clientId: UUID
  clientName: string
  clientEmail: string
  status: ClientStatus
  accessExpiresAt: string
  consultantName: string | null
  events: { id: UUID; name: string; type: string; date: string; guests: number; budgetPkr: number | null; progress: EventProgress }[]
  quotes: ConsultationQuote[]
  openFollowUps: number
}

export type ConsultationNote = {
  id: UUID
  clientId: UUID
  eventId: UUID | null
  authorName: string | null
  body: string
  followUpAt: string | null
  completedAt: string | null
  createdAt: string
}
