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
  UUID,
} from '@/types'

/**
 * Data access layer for the client app.
 *
 * The backend is not connected yet: reads resolve to empty results and writes
 * reject. Replace each method body with a real request once its endpoint exists;
 * the signatures are what the pages already consume.
 */
export const api = {
  me: async (): Promise<ClientUser | null> => null,

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
    list: async (): Promise<InventoryItem[]> => [],
    get: async (_id: UUID): Promise<InventoryItem | undefined> => undefined,
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
