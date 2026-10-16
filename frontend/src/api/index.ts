import type {
  ActivityEntry,
  ARSet,
  BudgetLine,
  BudgetSnapshot,
  ClientEvent,
  ClientUser,
  EventCreateInput,
  Inspiration,
  InventoryItem,
  Message,
  Moodboard,
  MoodboardControls,
  ProfileUpdate,
  QuestionnaireData,
  QuoteRequest,
  RecommendedInspiration,
  UUID,
} from '@/types'
import defaultCover from '@/assets/images/img_11.jpg'
import { apiRequest } from './client'

type ApiEvent = Omit<ClientEvent, 'coverImage'> & { coverImage: string | null }

/** Events without an uploaded cover use a brand image so cards always have a picture. */
function withCover(event: ApiEvent): ClientEvent {
  return { ...event, coverImage: event.coverImage ?? defaultCover }
}

type ApiMoodboard = Omit<Moodboard, 'cover' | 'tiles'>

/** Adds preview images; items without photos fall back to a brand image. */
function withPreview(board: ApiMoodboard): Moodboard {
  const photos = board.items.map((i) => i.item.imageUrl).filter((url): url is string => Boolean(url))
  const cover = photos[0] ?? defaultCover
  return { ...board, cover, tiles: photos.length > 0 ? photos : [cover] }
}

type ApiInspiration = {
  id: UUID
  slug: string
  name: string
  summary: string | null
  styleTags: string[]
  eventTypes: Inspiration['eventTypes']
  palette: string[]
  budgetTier: Inspiration['budgetTier']
  coverUrl: string | null
  imageUrls: string[]
  isFeatured: boolean
  items: Inspiration['items']
}

export function toInspiration(i: ApiInspiration): Inspiration {
  const cover = i.coverUrl ?? i.imageUrls[0] ?? defaultCover
  return {
    id: i.id, slug: i.slug, name: i.name, summary: i.summary ?? '', eventTypes: i.eventTypes,
    styleTags: i.styleTags, style: i.styleTags.join(' · '), palette: i.palette, budgetTier: i.budgetTier,
    featured: i.isFeatured, items: i.items, cover, tiles: i.imageUrls.length > 0 ? i.imageUrls : [cover],
  }
}

type ApiBudget = {
  eventId: UUID
  targetBudgetPkr: number | null
  lines: { id: UUID; category: string; inventoryItemId: UUID; quantity: number; included: boolean }[]
  items: InventoryItem[]
  totals: BudgetSnapshot['totals']
}

function toSnapshot(b: ApiBudget): BudgetSnapshot {
  return {
    eventId: b.eventId,
    budgetPkr: b.targetBudgetPkr,
    lines: b.lines.map((l) => ({ id: l.id, category: l.category, itemId: l.inventoryItemId, qty: l.quantity, included: l.included })),
    items: b.items,
    totals: b.totals,
  }
}

/**
 * Data access layer for the app. Connected sections call the backend through
 * `apiRequest`; the rest still return empty results until their backend step lands.
 */
export const api = {
  me: {
    get: (): Promise<ClientUser> => apiRequest('/api/me'),
    update: (changes: ProfileUpdate): Promise<ClientUser> =>
      apiRequest('/api/me', { method: 'PATCH', body: changes }),
  },

  auth: {
    forgotPassword: (email: string): Promise<void> =>
      apiRequest('/api/auth/forgot-password', { method: 'POST', body: { email }, auth: false }),
  },

  events: {
    list: async (): Promise<ClientEvent[]> =>
      (await apiRequest<ApiEvent[]>('/api/events')).map(withCover),
    get: async (id: UUID): Promise<ClientEvent> => withCover(await apiRequest<ApiEvent>(`/api/events/${id}`)),
    create: async (input: EventCreateInput): Promise<ClientEvent> =>
      withCover(await apiRequest<ApiEvent>('/api/events', { method: 'POST', body: input })),
  },

  questionnaire: {
    get: (eventId: UUID): Promise<QuestionnaireData> => apiRequest(`/api/events/${eventId}/questionnaire`),
    save: (eventId: UUID, data: Omit<QuestionnaireData, 'updatedAt'>): Promise<QuestionnaireData> =>
      apiRequest(`/api/events/${eventId}/questionnaire`, { method: 'PUT', body: data }),
  },

  moodboards: {
    list: async (): Promise<Moodboard[]> => (await apiRequest<ApiMoodboard[]>('/api/moodboards')).map(withPreview),
    byEvent: async (eventId: UUID): Promise<Moodboard[]> =>
      (await apiRequest<ApiMoodboard[]>(`/api/events/${eventId}/moodboards`)).map(withPreview),
    generate: async (eventId: UUID, controls: MoodboardControls): Promise<Moodboard> =>
      withPreview(await apiRequest<ApiMoodboard>(`/api/events/${eventId}/moodboards/generate`, { method: 'POST', body: controls })),
    update: async (id: UUID, changes: { title?: string; liked?: boolean }): Promise<Moodboard> =>
      withPreview(await apiRequest<ApiMoodboard>(`/api/moodboards/${id}`, { method: 'PATCH', body: changes })),
    duplicate: async (id: UUID): Promise<Moodboard> =>
      withPreview(await apiRequest<ApiMoodboard>(`/api/moodboards/${id}/duplicate`, { method: 'POST' })),
    remove: (id: UUID): Promise<void> => apiRequest(`/api/moodboards/${id}`, { method: 'DELETE' }),
  },

  inspirations: {
    list: async (): Promise<Inspiration[]> => (await apiRequest<ApiInspiration[]>('/api/inspirations')).map(toInspiration),
    get: async (slug: string): Promise<Inspiration> =>
      toInspiration(await apiRequest<ApiInspiration>(`/api/inspirations/${encodeURIComponent(slug)}`)),
    /** Copies the concept into a new moodboard for the event; also drafts the budget if it's empty. */
    adopt: (slug: string, eventId: UUID): Promise<{ moodboardId: UUID; eventId: UUID; budgetDrafted: boolean }> =>
      apiRequest(`/api/inspirations/${encodeURIComponent(slug)}/adopt`, { method: 'POST', body: { eventId } }),
    recommendedFor: async (eventId: UUID): Promise<RecommendedInspiration[]> =>
      (
        await apiRequest<(Omit<RecommendedInspiration, 'inspiration'> & { inspiration: ApiInspiration })[]>(
          `/api/events/${eventId}/inspiration-recommendations`,
        )
      ).map((r) => ({ ...r, inspiration: toInspiration(r.inspiration) })),
  },

  inventory: {
    list: (): Promise<InventoryItem[]> => apiRequest('/api/inventory'),
    get: (id: UUID): Promise<InventoryItem> => apiRequest(`/api/inventory/${id}`),
  },

  budget: {
    forEvent: async (eventId: UUID): Promise<BudgetSnapshot> =>
      toSnapshot(await apiRequest<ApiBudget>(`/api/events/${eventId}/budget`)),
    save: async (eventId: UUID, budgetPkr: number | null, lines: BudgetLine[]): Promise<BudgetSnapshot> =>
      toSnapshot(
        await apiRequest<ApiBudget>(`/api/events/${eventId}/budget`, {
          method: 'PUT',
          body: {
            targetBudgetPkr: budgetPkr,
            lines: lines.map((l) => ({
              id: l.id, category: l.category, inventoryItemId: l.itemId, quantity: l.qty, included: l.included,
            })),
          },
        }),
      ),
    requestQuote: (eventId: UUID, note?: string): Promise<QuoteRequest> =>
      apiRequest(`/api/events/${eventId}/quote-requests`, { method: 'POST', body: { note } }),
    /** Starter budget from a moodboard (default: the newest one; generated if none). */
    fromMoodboard: async (eventId: UUID, options: { moodboardId?: UUID; replace?: boolean } = {}): Promise<BudgetSnapshot> =>
      toSnapshot(await apiRequest<ApiBudget>(`/api/events/${eventId}/budget/generate`, { method: 'POST', body: options })),
  },

  messages: {
    /** The signed-in client's thread, oldest first. Pass `before` (ISO) to page back. */
    list: (before?: string): Promise<Message[]> =>
      apiRequest(`/api/messages${before ? `?before=${encodeURIComponent(before)}` : ''}`),
    send: (body: string): Promise<Message> => apiRequest('/api/messages', { method: 'POST', body: { body } }),
  },

  ar: {
    list: async (): Promise<ARSet[]> => [],
    forEvent: async (_eventId: UUID): Promise<ARSet | undefined> => undefined,
  },

  activity: {
    list: (): Promise<ActivityEntry[]> => apiRequest('/api/activity'),
    forEvent: (eventId: UUID): Promise<ActivityEntry[]> => apiRequest(`/api/activity?eventId=${eventId}`),
  },
}
