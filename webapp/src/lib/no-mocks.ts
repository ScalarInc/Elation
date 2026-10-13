import type { ActivityEntry, ARSet, BudgetSnapshot, ClientUser, FixtureEvent, Inspiration, InventoryItem, Message, MessageThread, Moodboard } from '@/mocks/types'

/**
 * Production stand-in for `@/mocks/fixtures` (aliased in vite.config.ts): the
 * same exports, empty. Production builds always talk to the API, so no demo
 * data ever ships to clients (docs/step-13-frontend-integration.md, P57).
 */

export const currentUser: ClientUser = {
  id: '',
  name: '',
  email: '',
  avatarInitials: '',
  accessExpiresAt: '',
  consultant: { id: '', name: '', email: '', avatarInitials: '' },
}
export const events: FixtureEvent[] = []
export const moodboards: Moodboard[] = []
export const inventory: InventoryItem[] = []
export const budgets: BudgetSnapshot[] = []
export const inspirations: Inspiration[] = []
export const messages: Message[] = []
export const threads: MessageThread[] = []
export const arSets: ARSet[] = []
export const activity: ActivityEntry[] = []
