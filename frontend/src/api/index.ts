import type {
  ActivityEntry,
  ARSet,
  BudgetSnapshot,
  ClientEvent,
  ClientUser,
  Inspiration,
  InventoryItem,
  Message,
  MessageThread,
  Moodboard,
  ProfileUpdate,
  UUID,
} from '@/types'
import { apiRequest } from './client'

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
    list: async (): Promise<ClientEvent[]> => [],
    get: async (_id: UUID): Promise<ClientEvent | undefined> => undefined,
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
    forEvent: async (_eventId: UUID): Promise<BudgetSnapshot | undefined> => undefined,
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
