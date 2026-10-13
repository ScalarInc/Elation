import type {
  AdminArSetDto,
  AdminClientDetail,
  AdminInspirationDto,
  AdminQuoteDto,
  AnalyticsDto,
  AnalyticsQuery,
  ClientPageDto,
  ExtendBody,
  InquiryDto,
  InspirationWriteBody,
  InventoryImportReport,
  InventoryItemDto,
  InventoryWriteBody,
  ListClientsQuery,
  NoteDto,
  OverviewDto,
  PublicInquiryBody,
  SettingsDto,
  TeamMemberDto,
} from '@elation/shared/api'
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api/client'

/** Admin & consultant console (docs/step-12-admin.md). */

type InviteResult = { userId: string; activationUrl: string; inviteExpiresAt: string; emailed: boolean }

const qs = (q: Record<string, unknown>) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  return p.size ? `?${p}` : ''
}

export const adminApi = {
  overview: (q: AnalyticsQuery = {}) => apiFetch<OverviewDto>(`/admin/overview${qs(q)}`),
  analytics: (q: AnalyticsQuery = {}) => apiFetch<AnalyticsDto>(`/admin/analytics${qs(q)}`),
  clients: (q: Partial<ListClientsQuery>) => apiFetch<ClientPageDto>(`/admin/clients${qs(q)}`),
  client: (id: string) => apiFetch<AdminClientDetail>(`/admin/clients/${id}`),
  invite: (body: { name: string; email: string; phone?: string; consultantId?: string; accessDays?: number }) =>
    apiFetch<InviteResult>('/admin/clients/invite', { method: 'POST', body }),
  resendInvite: (id: string) => apiFetch<InviteResult>(`/admin/clients/${id}/resend-invite`, { method: 'POST' }),
  extend: (id: string, body: ExtendBody) => apiFetch<AdminClientDetail>(`/admin/clients/${id}/extend`, { method: 'POST', body }),
  revoke: (id: string, reason: string) => apiFetch<AdminClientDetail>(`/admin/clients/${id}/revoke`, { method: 'POST', body: { reason } }),
  restore: (id: string) => apiFetch<AdminClientDetail>(`/admin/clients/${id}/restore`, { method: 'POST' }),
  updateClient: (id: string, body: { name?: string; phone?: string | null; consultantId?: string }) =>
    apiFetch<AdminClientDetail>(`/admin/clients/${id}`, { method: 'PATCH', body }),
  bulk: (body: { ids: string[]; action: 'extend' | 'revoke'; days?: number; reason?: string }) =>
    apiFetch<{ done: string[]; failed: { id: string; message: string }[] }>('/admin/clients/bulk', { method: 'POST', body }),
  addNote: (clientId: string, body: { body: string; eventId?: string; followUpAt?: string }) =>
    apiFetch<NoteDto>(`/admin/clients/${clientId}/notes`, { method: 'POST', body }),
  updateNote: (id: string, body: { body?: string; followUpAt?: string | null; done?: boolean }) => apiFetch<NoteDto>(`/admin/notes/${id}`, { method: 'PATCH', body }),
  followUps: (due: 'today' | 'overdue' | 'week' | 'all') => apiFetch<NoteDto[]>(`/admin/follow-ups?due=${due}`),
  quotes: (status?: string) => apiFetch<AdminQuoteDto[]>(`/admin/quotes${qs({ status })}`),
  updateQuote: (id: string, body: { status: string; message?: string }) => apiFetch<AdminQuoteDto>(`/admin/quotes/${id}`, { method: 'PATCH', body }),
  inquiries: (status?: string) => apiFetch<InquiryDto[]>(`/admin/inquiries${qs({ status })}`),
  updateInquiry: (id: string, status: 'new' | 'contacted' | 'closed') => apiFetch<InquiryDto>(`/admin/inquiries/${id}`, { method: 'PATCH', body: { status } }),
  convertInquiry: (id: string, body: { consultantId?: string; accessDays?: number }) =>
    apiFetch<InviteResult & { inquiry: InquiryDto }>(`/admin/inquiries/${id}/convert`, { method: 'POST', body }),
  inspirations: () => apiFetch<AdminInspirationDto[]>('/admin/inspirations'),
  saveInspiration: (id: string | null, body: InspirationWriteBody) =>
    apiFetch<AdminInspirationDto>(id ? `/admin/inspirations/${id}` : '/admin/inspirations', { method: id ? 'PATCH' : 'POST', body }),
  publish: (id: string, on: boolean) => apiFetch<AdminInspirationDto>(`/admin/inspirations/${id}/${on ? 'publish' : 'unpublish'}`, { method: 'POST' }),
  deleteInspiration: (id: string) => apiFetch<void>(`/admin/inspirations/${id}`, { method: 'DELETE' }),
  arSets: () => apiFetch<AdminArSetDto[]>('/admin/ar-sets'),
  saveArSet: (id: string | null, body: object) => apiFetch<AdminArSetDto>(id ? `/admin/ar-sets/${id}` : '/admin/ar-sets', { method: id ? 'PATCH' : 'POST', body }),
  arStatus: (id: string, body: { status: string; progressPercent: number; eta?: string | null }) =>
    apiFetch<AdminArSetDto>(`/admin/ar-sets/${id}/status`, { method: 'POST', body }),
  addAsset: (id: string, body: { name: string; source: string; modelFileId?: string | null }) =>
    apiFetch<AdminArSetDto>(`/admin/ar-sets/${id}/assets`, { method: 'POST', body }),
  removeAsset: (id: string, assetId: string) => apiFetch<AdminArSetDto>(`/admin/ar-sets/${id}/assets/${assetId}`, { method: 'DELETE' }),
  inventory: () => apiFetch<InventoryItemDto[]>('/inventory?includeArchived=true'),
  saveInventory: (id: string | null, body: InventoryWriteBody) =>
    apiFetch<InventoryItemDto>(id ? `/admin/inventory/${id}` : '/admin/inventory', { method: id ? 'PATCH' : 'POST', body }),
  archiveInventory: (id: string, archived: boolean) => apiFetch<InventoryItemDto>(`/admin/inventory/${id}/${archived ? 'archive' : 'restore'}`, { method: 'POST' }),
  importInventory: async (csv: string, commit: boolean) => {
    const res = await fetch(`/api/v1/admin/inventory/import?commit=${commit}`, { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: csv, credentials: 'same-origin' })
    const data = await res.json()
    if (!res.ok) throw new Error(data?.error?.message ?? 'Import failed')
    return data as InventoryImportReport
  },
  team: () => apiFetch<TeamMemberDto[]>('/admin/team'),
  inviteStaff: (body: { name: string; email: string; role: 'consultant' | 'admin' }) => apiFetch<InviteResult>('/admin/team', { method: 'POST', body }),
  updateStaff: (id: string, body: { role?: 'consultant' | 'admin'; active?: boolean; reassignClientsTo?: string }) =>
    apiFetch<TeamMemberDto>(`/admin/team/${id}`, { method: 'PATCH', body }),
  settings: () => apiFetch<SettingsDto>('/admin/settings'),
  saveSettings: (body: Partial<SettingsDto>) => apiFetch<SettingsDto>('/admin/settings', { method: 'PATCH', body }),
  submitInquiry: (body: PublicInquiryBody) => apiFetch<{ ok: true }>('/public/inquiries', { method: 'POST', body }),
}

export const useOverview = () => useQuery({ queryKey: ['admin', 'overview'], queryFn: () => adminApi.overview() })
export const useAnalytics = (q: AnalyticsQuery) => useQuery({ queryKey: ['admin', 'analytics', q], queryFn: () => adminApi.analytics(q), placeholderData: keepPreviousData })
export const useAdminClients = (q: Partial<ListClientsQuery>) =>
  useQuery({ queryKey: ['admin', 'clients', q], queryFn: () => adminApi.clients(q), placeholderData: keepPreviousData })
export const useAdminClient = (id: string | undefined) => useQuery({ queryKey: ['admin', 'client', id], queryFn: () => adminApi.client(id!), enabled: Boolean(id) })
export const useAdminQuotes = (status?: string) => useQuery({ queryKey: ['admin', 'quotes', status ?? 'all'], queryFn: () => adminApi.quotes(status) })
export const useInquiries = (status?: string) => useQuery({ queryKey: ['admin', 'inquiries', status ?? 'all'], queryFn: () => adminApi.inquiries(status) })
export const useAdminInspirations = () => useQuery({ queryKey: ['admin', 'inspirations'], queryFn: adminApi.inspirations })
export const useAdminArSets = () => useQuery({ queryKey: ['admin', 'ar-sets'], queryFn: adminApi.arSets })
export const useAdminInventory = () => useQuery({ queryKey: ['admin', 'inventory'], queryFn: adminApi.inventory })
export const useTeam = (enabled = true) => useQuery({ queryKey: ['admin', 'team'], queryFn: adminApi.team, enabled })
export const useSettings = () => useQuery({ queryKey: ['admin', 'settings'], queryFn: adminApi.settings })

/** A mutation that refreshes the admin views it touches. */
export function useAdminMutation<V, R>(fn: (v: V) => Promise<R>, keys: string[][] = [['admin']]) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const k of keys) void qc.invalidateQueries({ queryKey: k })
    },
  })
}
