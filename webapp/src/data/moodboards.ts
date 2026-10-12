import type {
  GenerateMoodboardBody,
  ListMoodboardsQuery,
  MoodboardControls,
  MoodboardDefaults,
  MoodboardDto,
  TileAlternative,
} from '@elation/shared/api'
import { BRAND_PALETTE } from '@elation/shared/moodboard'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { API_MODE, ApiError, apiFetch } from '@/lib/api/client'
import { moodboards as fixtureMoodboards } from '@/mocks/fixtures'

/** Moodboards (docs/step-07-moodboard.md). */

// ─────────────── mock mode: read-only demo boards ───────────────

function fromFixture(m: (typeof fixtureMoodboards)[number]): MoodboardDto {
  return {
    id: m.id,
    eventId: m.eventId,
    title: m.title,
    tag: m.tag,
    cover: m.cover,
    tiles: m.tiles,
    palette: m.palette,
    createdAt: m.createdAt,
    liked: m.liked,
    status: 'saved',
    variantLabel: 'A',
    generationId: m.id,
    isPrimary: true,
    controls: null,
    narrative: null,
    generator: 'fixture',
    tileItems: m.tiles.map((url, i) => ({
      id: `${m.id}-${i}`,
      position: i,
      kind: 'inspiration',
      area: null,
      imageUrl: url,
      item: null,
      score: null,
      reasons: [],
      locked: false,
    })),
  }
}
const needsServer = () =>
  Promise.reject(new ApiError(0, 'MOCK_MODE', 'Curating needs the Elation server (VITE_API_MODE=http).'))
const mockDefaults: MoodboardDefaults = {
  fromQuestionnaire: false,
  controls: { mood: 'romantic', style: 'modern-luxury', palette: BRAND_PALETTE, density: 'Moderate', venue: 'Ballroom', venueLocked: true },
}

// ─────────────── API ───────────────

const qs = (params: Record<string, unknown>) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))
  return s.size ? `?${s}` : ''
}

export const moodboardsApi = {
  list: (query: ListMoodboardsQuery = {}) =>
    API_MODE === 'mock'
      ? Promise.resolve(fixtureMoodboards.map(fromFixture))
      : apiFetch<MoodboardDto[]>(`/moodboards${qs(query)}`),
  forEvent: (eventId: string) =>
    API_MODE === 'mock'
      ? Promise.resolve(fixtureMoodboards.filter((m) => m.eventId === eventId).map(fromFixture))
      : apiFetch<MoodboardDto[]>(`/events/${eventId}/moodboards`),
  defaults: (eventId: string) =>
    API_MODE === 'mock' ? Promise.resolve(mockDefaults) : apiFetch<MoodboardDefaults>(`/events/${eventId}/moodboards/defaults`),
  generate: (eventId: string, body: GenerateMoodboardBody, idempotencyKey: string) =>
    API_MODE === 'mock'
      ? needsServer()
      : apiFetch<{ generationId: string; concepts: MoodboardDto[] }>(`/events/${eventId}/moodboards/generate`, {
          method: 'POST',
          body,
          headers: { 'Idempotency-Key': idempotencyKey },
        }),
  patch: (id: string, body: { title?: string; liked?: boolean }) =>
    API_MODE === 'mock' ? needsServer() : apiFetch<MoodboardDto>(`/moodboards/${id}`, { method: 'PATCH', body }),
  save: (id: string) => (API_MODE === 'mock' ? needsServer() : apiFetch<MoodboardDto>(`/moodboards/${id}/save`, { method: 'POST' })),
  primary: (id: string) =>
    API_MODE === 'mock' ? needsServer() : apiFetch<MoodboardDto>(`/moodboards/${id}/primary`, { method: 'POST' }),
  duplicate: (id: string) =>
    API_MODE === 'mock' ? needsServer() : apiFetch<MoodboardDto>(`/moodboards/${id}/duplicate`, { method: 'POST' }),
  archive: (id: string) => (API_MODE === 'mock' ? needsServer() : apiFetch<void>(`/moodboards/${id}`, { method: 'DELETE' })),
  reorder: (id: string, tileIds: string[]) =>
    API_MODE === 'mock'
      ? needsServer()
      : apiFetch<MoodboardDto>(`/moodboards/${id}/tiles/order`, { method: 'PUT', body: { tileIds } }),
  updateTile: (id: string, tileId: string, body: { locked?: boolean; inventoryItemId?: string }) =>
    API_MODE === 'mock'
      ? needsServer()
      : apiFetch<MoodboardDto>(`/moodboards/${id}/tiles/${tileId}`, { method: 'PATCH', body }),
  alternatives: (id: string, tileId: string) =>
    apiFetch<TileAlternative[]>(`/moodboards/${id}/tiles/${tileId}/alternatives`),
  consult: (id: string, tileId: string, note?: string) =>
    API_MODE === 'mock'
      ? needsServer()
      : apiFetch<void>(`/moodboards/${id}/tiles/${tileId}/consult`, { method: 'POST', body: { note } }),
}

// ─────────────── hooks ───────────────

export const eventMoodboardsKey = (eventId: string) => ['events', eventId, 'moodboards'] as const

export function useEventMoodboards(eventId: string) {
  return useQuery({ queryKey: eventMoodboardsKey(eventId), queryFn: () => moodboardsApi.forEvent(eventId) })
}

export function useMoodboardDefaults(eventId: string) {
  return useQuery({ queryKey: [...eventMoodboardsKey(eventId), 'defaults'], queryFn: () => moodboardsApi.defaults(eventId) })
}

export function useMoodboardLibrary(query: ListMoodboardsQuery = {}) {
  return useQuery({ queryKey: ['moodboards', query], queryFn: () => moodboardsApi.list(query) })
}

/** After any moodboard change: the event's concepts, the library and event progress may all move. */
function useRefresh() {
  const qc = useQueryClient()
  return (board?: MoodboardDto) => {
    void qc.invalidateQueries({ queryKey: ['moodboards'] })
    void qc.invalidateQueries({ queryKey: ['events'], predicate: (q) => q.queryKey[2] !== 'questionnaire' })
    if (board) {
      qc.setQueryData<MoodboardDto[]>(eventMoodboardsKey(board.eventId), (list) =>
        list?.map((b) => (b.id === board.id ? board : b)),
      )
    }
  }
}

export function useGenerateMoodboards(eventId: string) {
  const refresh = useRefresh()
  return useMutation({
    /** One Idempotency-Key per click (the caller makes it), so a retried request never curates twice. */
    mutationFn: ({ controls, keepLockedFrom, idempotencyKey }: { controls: MoodboardControls; keepLockedFrom?: string; idempotencyKey: string }) =>
      moodboardsApi.generate(eventId, { controls, keepLockedFrom }, idempotencyKey),
    onSuccess: () => refresh(),
  })
}

export function useMoodboardAction() {
  const refresh = useRefresh()
  const qc = useQueryClient()
  return {
    patch: useMutation({ mutationFn: (v: { id: string; title?: string; liked?: boolean }) => moodboardsApi.patch(v.id, v), onSuccess: refresh }),
    save: useMutation({ mutationFn: moodboardsApi.save, onSuccess: refresh }),
    primary: useMutation({ mutationFn: moodboardsApi.primary, onSuccess: refresh }),
    duplicate: useMutation({ mutationFn: moodboardsApi.duplicate, onSuccess: () => refresh() }),
    archive: useMutation({ mutationFn: moodboardsApi.archive, onSuccess: () => refresh() }),
    reorder: useMutation({
      mutationFn: (v: { id: string; eventId: string; tileIds: string[] }) => moodboardsApi.reorder(v.id, v.tileIds),
      onSuccess: refresh,
      // The grid was reordered optimistically: on failure, show the server's order again.
      onError: (_err, v) => void qc.invalidateQueries({ queryKey: eventMoodboardsKey(v.eventId) }),
    }),
    updateTile: useMutation({
      mutationFn: (v: { id: string; tileId: string; locked?: boolean; inventoryItemId?: string }) =>
        moodboardsApi.updateTile(v.id, v.tileId, { locked: v.locked, inventoryItemId: v.inventoryItemId }),
      onSuccess: refresh,
    }),
    consult: useMutation({ mutationFn: (v: { id: string; tileId: string; note?: string }) => moodboardsApi.consult(v.id, v.tileId, v.note) }),
  }
}

export function useTileAlternatives(boardId: string, tileId: string | null) {
  return useQuery({
    queryKey: ['moodboards', boardId, 'tiles', tileId, 'alternatives'],
    queryFn: () => moodboardsApi.alternatives(boardId, tileId!),
    enabled: Boolean(tileId) && API_MODE === 'http',
  })
}
