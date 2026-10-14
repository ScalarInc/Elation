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
  MessageThread,
  Moodboard,
  ProfileUpdate,
  QuestionnaireData,
  QuoteRequest,
  UUID,
} from '@/types'
import defaultCover from '@/assets/images/img_11.jpg'
import { apiRequest } from './client'

type ApiEvent = Omit<ClientEvent, 'coverImage'> & { coverImage: string | null }

/** Events without an uploaded cover use a brand image so cards always have a picture. */
function withCover(event: ApiEvent): ClientEvent {
  return { ...event, coverImage: event.coverImage ?? defaultCover }
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
    list: async (): Promise<Moodboard[]> => [],
    byEvent: async (_eventId: UUID): Promise<Moodboard[]> => [],
    get: async (_id: UUID): Promise<Moodboard | undefined> => undefined,
  },

  inspirations: {
    list: async (): Promise<Inspiration[]> => [],
    get: async (_slug: string): Promise<Inspiration | undefined> => undefined,
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
  },

  messages: {
    thread: async (): Promise<Message[]> => [],
    threads: async (): Promise<MessageThread[]> => [],
    send: async (_body: string): Promise<Message> => {
      throw new Error('Messaging is not connected yet.')
    },
  },

  ar: {
    list: async (): Promise<ARSet[]> => [],
    forEvent: async (_eventId: UUID): Promise<ARSet | undefined> => undefined,
  },

  activity: {
    list: async (): Promise<ActivityEntry[]> => [],
    forEvent: async (_eventId: UUID): Promise<ActivityEntry[]> => [],
  },
}
