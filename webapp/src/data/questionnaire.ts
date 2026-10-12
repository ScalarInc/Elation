import type {
  PatchQuestionnaireBody,
  QuestionnaireBrief,
  QuestionnaireDto,
} from '@elation/shared/api'
import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { API_MODE, apiFetch } from '@/lib/api/client'
import { useQuestionnaire } from '@/questionnaire/store'

/** Questionnaire API (docs/step-05-questionnaire.md). */
export const questionnaireApi = {
  get: (eventId: string) => apiFetch<QuestionnaireDto>(`/events/${eventId}/questionnaire`),
  patch: (eventId: string, body: PatchQuestionnaireBody) =>
    apiFetch<QuestionnaireDto>(`/events/${eventId}/questionnaire`, { method: 'PATCH', body }),
  submit: (eventId: string) =>
    apiFetch<QuestionnaireDto>(`/events/${eventId}/questionnaire/submit`, { method: 'POST' }),
  reopen: (eventId: string) =>
    apiFetch<QuestionnaireDto>(`/events/${eventId}/questionnaire/reopen`, { method: 'POST' }),
  brief: (eventId: string) => apiFetch<QuestionnaireBrief>(`/events/${eventId}/questionnaire/brief`),
}

export const questionnaireKey = (eventId: string) => ['events', eventId, 'questionnaire'] as const

/**
 * Load an event's questionnaire from the server into the local store, which
 * then keeps local edits and syncs them back (see questionnaire/store.ts).
 * Every page that reads or edits answers calls this once.
 */
export function useQuestionnaireSync(eventId: string | undefined) {
  const hydrate = useQuestionnaire((s) => s.hydrate)
  const query = useQuery({
    queryKey: questionnaireKey(eventId ?? ''),
    queryFn: () => questionnaireApi.get(eventId!),
    enabled: Boolean(eventId) && API_MODE === 'http',
    staleTime: 0,
  })
  useEffect(() => {
    if (eventId && query.data) hydrate(eventId, query.data)
  }, [eventId, query.data, hydrate])

  if (API_MODE === 'mock') return { isPending: false, isError: false, refetch: () => {} }
  return { isPending: query.isPending, isError: query.isError, refetch: query.refetch }
}

export function useSubmitQuestionnaire(eventId: string) {
  const qc = useQueryClient()
  const flush = useQuestionnaire((s) => s.flush)
  const hydrate = useQuestionnaire((s) => s.hydrate)
  return useMutation({
    mutationFn: async () => {
      await flush(eventId) // make sure the last keystrokes are saved first
      return questionnaireApi.submit(eventId)
    },
    onSuccess: (dto) => {
      hydrate(eventId, dto)
      void qc.invalidateQueries({ queryKey: ['events'] })
    },
  })
}

export function useQuestionnaireBrief(eventId: string, enabled = true) {
  return useQuery({
    queryKey: [...questionnaireKey(eventId), 'brief'],
    queryFn: () => questionnaireApi.brief(eventId),
    enabled: enabled && API_MODE === 'http',
  })
}
