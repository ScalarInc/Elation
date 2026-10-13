import type { AdminClient, AdminSummary, ClientCreateInput, ClientStatus, ClientUpdateInput, InviteResult } from '@/types/admin'
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
}
