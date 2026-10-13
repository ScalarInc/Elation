import type {
  AdminClient,
  AdminInventoryItem,
  AdminSummary,
  ClientCreateInput,
  ClientStatus,
  ClientUpdateInput,
  InventoryItemInput,
  InventoryItemUpdate,
  InviteResult,
  PriceChange,
} from '@/types/admin'
import type { UUID } from '@/types'
import { apiRequest } from './client'

/** Admin console endpoints. The backend rejects these for non-admins. */
export const adminApi = {
  admins: {
    list: (): Promise<AdminSummary[]> => apiRequest('/api/admin/admins'),
  },

  clients: {
    list: (filters: { search?: string; status?: ClientStatus } = {}): Promise<AdminClient[]> => {
      const params = new URLSearchParams()
      if (filters.search) params.set('search', filters.search)
      if (filters.status) params.set('status', filters.status)
      const query = params.toString()
      return apiRequest(`/api/admin/clients${query ? `?${query}` : ''}`)
    },
    create: (input: ClientCreateInput): Promise<InviteResult> =>
      apiRequest('/api/admin/clients', { method: 'POST', body: input }),
    update: (id: UUID, changes: ClientUpdateInput): Promise<AdminClient> =>
      apiRequest(`/api/admin/clients/${id}`, { method: 'PATCH', body: changes }),
    resendInvite: (id: UUID): Promise<InviteResult> =>
      apiRequest(`/api/admin/clients/${id}/invite`, { method: 'POST' }),
  },

  inventory: {
    list: (): Promise<AdminInventoryItem[]> => apiRequest('/api/admin/inventory'),
    create: (input: InventoryItemInput): Promise<AdminInventoryItem> =>
      apiRequest('/api/admin/inventory', { method: 'POST', body: input }),
    update: (id: UUID, changes: InventoryItemUpdate): Promise<AdminInventoryItem> =>
      apiRequest(`/api/admin/inventory/${id}`, { method: 'PATCH', body: changes }),
    priceHistory: (id: UUID): Promise<PriceChange[]> => apiRequest(`/api/admin/inventory/${id}/price-history`),
    uploadImage: (id: UUID, file: File): Promise<AdminInventoryItem> => {
      const form = new FormData()
      form.append('file', file)
      return apiRequest(`/api/admin/inventory/${id}/image`, { method: 'POST', body: form })
    },
  },
}
