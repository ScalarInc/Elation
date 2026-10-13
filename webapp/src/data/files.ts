import type { FileDto, FilePurposeDto } from '@elation/shared/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { API_MODE, apiFetch } from '@/lib/api/client'
import { questionnaireKey } from '@/data/questionnaire'

/** Files (docs/step-11-files.md). Links inside a FileDto expire after 10 minutes. */

export const filesApi = {
  forEvent: (eventId: string, purpose?: FilePurposeDto) =>
    API_MODE === 'mock' ? Promise.resolve([] as FileDto[]) : apiFetch<FileDto[]>(`/events/${eventId}/files${purpose ? `?purpose=${purpose}` : ''}`),
  get: (id: string) => apiFetch<FileDto>(`/files/${id}`),
  remove: (id: string) => apiFetch<void>(`/files/${id}`, { method: 'DELETE' }),
}

/** Refetched well before the signed links (10 min) expire. */
const LINK_STALE_MS = 5 * 60_000

export function useEventFiles(eventId: string | undefined) {
  return useQuery({
    queryKey: ['events', eventId, 'files'],
    queryFn: () => filesApi.forEvent(eventId!),
    enabled: Boolean(eventId),
    staleTime: LINK_STALE_MS,
    refetchInterval: LINK_STALE_MS,
  })
}

export function useDeleteFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: Pick<FileDto, 'id' | 'eventId'>) => filesApi.remove(file.id),
    onSuccess: (_v, file) => {
      if (file.eventId) {
        void qc.invalidateQueries({ queryKey: ['events', file.eventId, 'files'] })
        void qc.invalidateQueries({ queryKey: questionnaireKey(file.eventId) })
      }
    },
  })
}

/** Opens a file in a new tab with a fresh link (attachments carry no long-lived URL). */
export async function openFile(id: string, kind: 'view' | 'download' = 'view') {
  // Open synchronously so pop-up blockers allow it, then point it at the signed link.
  const win = window.open('', '_blank')
  if (win) win.opener = null
  try {
    const f = await filesApi.get(id)
    const url = kind === 'download' ? (f.downloadUrl ?? f.url) : (f.url ?? f.downloadUrl)
    if (!url) throw new Error('No link')
    if (win) win.location.href = url
    else window.location.assign(url)
  } catch (err) {
    win?.close()
    throw err
  }
}
