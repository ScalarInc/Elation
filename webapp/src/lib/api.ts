import {
  activity,
  arSets,
  budgets,
  currentUser,
  inspirations,
  inventory,
  messages,
  moodboards,
  threads,
} from '@/mocks/fixtures'
import type {
  ActivityEntry,
  ARSet,
  BudgetSnapshot,
  ClientUser,
  Inspiration,
  InventoryItem,
  Message,
  MessageThread,
  Moodboard,
  UUID,
} from '@/mocks/types'

// Simulates a real network call so we get skeletons + loading states in dev.
function delay<T>(value: T, ms = 300): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

export const api = {
  me: (): Promise<ClientUser> => delay(currentUser, 150),

  moodboards: {
    list: (): Promise<Moodboard[]> => delay(moodboards),
    byEvent: (eventId: UUID): Promise<Moodboard[]> =>
      delay(moodboards.filter((m) => m.eventId === eventId)),
    get: (id: UUID): Promise<Moodboard | undefined> =>
      delay(moodboards.find((m) => m.id === id)),
  },

  inspirations: {
    list: (): Promise<Inspiration[]> => delay(inspirations),
    get: (slug: string): Promise<Inspiration | undefined> =>
      delay(inspirations.find((i) => i.slug === slug)),
  },

  inventory: {
    list: (): Promise<InventoryItem[]> => delay(inventory),
    get: (id: UUID): Promise<InventoryItem | undefined> =>
      delay(inventory.find((i) => i.id === id)),
  },

  budget: {
    forEvent: (eventId: UUID): Promise<BudgetSnapshot | undefined> =>
      delay(budgets.find((b) => b.eventId === eventId)),
  },

  messages: {
    thread: (): Promise<Message[]> => delay(messages),
    threads: (): Promise<MessageThread[]> => delay(threads),
    send: (body: string): Promise<Message> =>
      delay(
        {
          id: `msg_${Date.now()}`,
          authorId: currentUser.id,
          authorName: currentUser.name,
          authorRole: 'client',
          body,
          createdAt: new Date().toISOString(),
          read: true,
        },
        200,
      ),
  },

  ar: {
    list: (): Promise<ARSet[]> => delay(arSets),
    forEvent: (eventId: UUID): Promise<ARSet | undefined> =>
      delay(arSets.find((s) => s.eventId === eventId)),
  },

  activity: {
    list: (): Promise<ActivityEntry[]> => delay(activity),
    forEvent: (eventId: UUID): Promise<ActivityEntry[]> =>
      delay(activity.filter((a) => a.eventId === eventId)),
  },
}
