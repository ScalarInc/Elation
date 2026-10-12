import { activity, currentUser, messages, threads } from '@/mocks/fixtures'
import type { ActivityEntry, Message, MessageThread, UUID } from '@/mocks/types'

/**
 * What's still served from mock fixtures: messages and the activity feed
 * (Step 10). Everything else reads the API through `src/data/*`.
 */

// Simulates a real network call so we get skeletons + loading states in dev.
function delay<T>(value: T, ms = 300): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

export const api = {
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

  activity: {
    list: (): Promise<ActivityEntry[]> => delay(activity),
    forEvent: (eventId: UUID): Promise<ActivityEntry[]> =>
      delay(activity.filter((a) => a.eventId === eventId)),
  },
}
