import type { ArAssetDto, ArSessionRequestBody, ArSetDto, EventArResponse } from '@elation/shared/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { API_MODE, ApiError, apiFetch } from '@/lib/api/client'
import { arSets as fixtureSets } from '@/mocks/fixtures'

/** AR sets (docs/step-09-inspirations-ar.md). */

function fromFixture(s: (typeof fixtureSets)[number]): ArSetDto {
  return {
    id: s.id,
    eventId: s.eventId ?? null,
    eventType: s.eventType,
    title: s.title,
    theme: s.theme,
    status: s.status,
    progressPercent: s.progressPercent,
    eta: s.eta ?? null,
    coverImage: s.coverImage,
    floorPlan: s.floorPlan,
    aerialViews: s.aerialViews,
    assetCount: s.assetCount,
    summary: s.summary,
    highlights: s.highlights,
    notifyRequested: false,
  }
}

const needsServer = () => Promise.reject(new ApiError(0, 'MOCK_MODE', 'This needs the Elation server (VITE_API_MODE=http).'))

export const arApi = {
  list: () => (API_MODE === 'mock' ? Promise.resolve(fixtureSets.map(fromFixture)) : apiFetch<ArSetDto[]>('/ar-sets')),
  forEvent: (eventId: string): Promise<EventArResponse> => {
    if (API_MODE === 'mock') {
      const set = fixtureSets.find((s) => s.eventId === eventId)
      return Promise.resolve({ set: set ? fromFixture(set) : null, showcase: null })
    }
    return apiFetch<EventArResponse>(`/events/${eventId}/ar`)
  },
  assets: (setId: string) => (API_MODE === 'mock' ? Promise.resolve([] as ArAssetDto[]) : apiFetch<ArAssetDto[]>(`/ar-sets/${setId}/assets`)),
  requestSession: (eventId: string, body: ArSessionRequestBody) =>
    API_MODE === 'mock'
      ? needsServer()
      : apiFetch<{ consultantName: string | null }>(`/events/${eventId}/ar/session-request`, { method: 'POST', body }),
  notifyMe: (setId: string) => (API_MODE === 'mock' ? needsServer() : apiFetch<void>(`/ar-sets/${setId}/notify-me`, { method: 'POST' })),
}

export function useArSets() {
  return useQuery({ queryKey: ['ar-sets'], queryFn: arApi.list })
}

export function useEventAr(eventId: string | undefined) {
  return useQuery({ queryKey: ['events', eventId, 'ar'], queryFn: () => arApi.forEvent(eventId!), enabled: Boolean(eventId) })
}

export function useArAssets(setId: string | undefined) {
  return useQuery({ queryKey: ['ar-sets', setId, 'assets'], queryFn: () => arApi.assets(setId!), enabled: Boolean(setId) })
}

export function useArSessionRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { eventId: string } & ArSessionRequestBody) => arApi.requestSession(v.eventId, { preferredDate: v.preferredDate, note: v.note }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['activity'] }),
  })
}

export function useArNotifyMe() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: arApi.notifyMe,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ar-sets'] })
      void qc.invalidateQueries({ queryKey: ['events'], predicate: (q) => q.queryKey[2] === 'ar' })
    },
  })
}
