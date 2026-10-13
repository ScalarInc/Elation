import type {
  AdoptInspirationBody,
  AdoptInspirationResponse,
  InspirationDetailDto,
  InspirationDto,
} from '@elation/shared/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { API_MODE, ApiError, apiFetch } from '@/lib/api/client'
import { inspirations as fixtureInspirations } from '@/mocks/fixtures'

/** Inspiration gallery (docs/step-09-inspirations-ar.md). */

function fromFixture(i: (typeof fixtureInspirations)[number]): InspirationDto {
  return {
    id: i.id,
    slug: i.slug,
    name: i.name,
    eventTypes: i.eventTypes,
    style: i.style,
    palette: i.palette,
    cover: i.cover,
    tiles: i.tiles,
    summary: i.summary,
    featured: i.featured ?? false,
    budgetTier: i.budgetTier ?? null,
  }
}

export const inspirationsApi = {
  // The gallery loads the whole published library once and filters instantly in the browser;
  // the API's filters serve deep links and future paging.
  list: () =>
    API_MODE === 'mock' ? Promise.resolve(fixtureInspirations.map(fromFixture)) : apiFetch<InspirationDto[]>('/inspirations'),
  get: (slug: string) => {
    if (API_MODE === 'mock') {
      const found = fixtureInspirations.find((i) => i.slug === slug)
      return found
        ? Promise.resolve<InspirationDetailDto>({ ...fromFixture(found), items: [], indicativeTotalPkr: 0 })
        : Promise.reject(new ApiError(404, 'INSPIRATION_NOT_FOUND', 'Concept not found'))
    }
    return apiFetch<InspirationDetailDto>(`/inspirations/${encodeURIComponent(slug)}`)
  },
  adopt: (slug: string, body: AdoptInspirationBody) =>
    API_MODE === 'mock'
      ? Promise.reject(new ApiError(0, 'MOCK_MODE', 'Adopting a concept needs the Elation server (VITE_API_MODE=http).'))
      : apiFetch<AdoptInspirationResponse>(`/inspirations/${encodeURIComponent(slug)}/adopt`, { method: 'POST', body }),
}

export function useInspirations() {
  return useQuery({ queryKey: ['inspirations'], queryFn: inspirationsApi.list, staleTime: 5 * 60 * 1000 })
}

export function useInspiration(slug: string | undefined) {
  return useQuery({
    queryKey: ['inspirations', slug],
    queryFn: () => inspirationsApi.get(slug!),
    enabled: Boolean(slug),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  })
}

/** Adopting touches the event's moodboards, budget, questionnaire and progress. */
export function useAdoptInspiration() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { slug: string } & AdoptInspirationBody) => inspirationsApi.adopt(v.slug, { eventId: v.eventId, mode: v.mode }),
    onSuccess: (_r, v) => {
      void qc.invalidateQueries({ queryKey: ['events'] })
      void qc.invalidateQueries({ queryKey: ['moodboards'] })
      void qc.invalidateQueries({ queryKey: ['budgets'] })
      qc.removeQueries({ queryKey: ['events', v.eventId, 'questionnaire'] })
    },
  })
}
