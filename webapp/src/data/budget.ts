import type {
  AddBudgetLineBody,
  ApplyToBudgetResponse,
  BudgetPlanDto,
  BudgetSummary,
  CreateBudgetBody,
  EventBudgetResponse,
  PutBudgetBody,
  QuoteDto,
  SeededBudgetResponse,
} from '@elation/shared/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { API_MODE, ApiError, apiFetch } from '@/lib/api/client'
import { eventsKey } from './events'

/** Budget estimator (docs/step-08-budget.md). */

// Mock mode has no budget store: the estimator shows its empty state and explains it needs the server.
const needsServer = () =>
  Promise.reject(new ApiError(0, 'MOCK_MODE', 'The budget estimator needs the Elation server (VITE_API_MODE=http).'))

export const budgetApi = {
  list: () => (API_MODE === 'mock' ? Promise.resolve([] as BudgetSummary[]) : apiFetch<BudgetSummary[]>('/budgets')),
  forEvent: (eventId: string) =>
    API_MODE === 'mock'
      ? Promise.resolve<EventBudgetResponse>({ plan: null, suggestedTargetPkr: 2_500_000, hasMoodboard: false })
      : apiFetch<EventBudgetResponse>(`/events/${eventId}/budget`),
  create: (eventId: string, body: CreateBudgetBody) =>
    API_MODE === 'mock' ? needsServer() : apiFetch<SeededBudgetResponse>(`/events/${eventId}/budget`, { method: 'POST', body }),
  save: (eventId: string, body: PutBudgetBody) =>
    API_MODE === 'mock' ? needsServer() : apiFetch<BudgetPlanDto>(`/events/${eventId}/budget`, { method: 'PUT', body }),
  addLine: (eventId: string, body: AddBudgetLineBody) =>
    API_MODE === 'mock' ? needsServer() : apiFetch<BudgetPlanDto>(`/events/${eventId}/budget/lines`, { method: 'POST', body }),
  reset: (eventId: string) =>
    API_MODE === 'mock' ? needsServer() : apiFetch<BudgetPlanDto>(`/events/${eventId}/budget/reset`, { method: 'POST' }),
  reprice: (eventId: string) =>
    API_MODE === 'mock' ? needsServer() : apiFetch<BudgetPlanDto>(`/events/${eventId}/budget/reprice`, { method: 'POST' }),
  sendToConsultant: (eventId: string, note?: string) =>
    API_MODE === 'mock'
      ? needsServer()
      : apiFetch<{ plan: BudgetPlanDto; consultantName: string | null }>(`/events/${eventId}/budget/send-to-consultant`, {
          method: 'POST',
          body: { note },
        }),
  quote: (eventId: string, note?: string) =>
    API_MODE === 'mock' ? needsServer() : apiFetch<QuoteDto>(`/events/${eventId}/budget/quote`, { method: 'POST', body: { note } }),
  applyMoodboard: (moodboardId: string) =>
    API_MODE === 'mock'
      ? needsServer()
      : apiFetch<ApplyToBudgetResponse>(`/moodboards/${moodboardId}/apply-to-budget`, { method: 'POST' }),
}

export const budgetsKey = ['budgets'] as const
export const eventBudgetKey = (eventId: string) => ['events', eventId, 'budget'] as const

export function useBudgets() {
  return useQuery({ queryKey: budgetsKey, queryFn: budgetApi.list })
}

export function useEventBudget(eventId: string | undefined) {
  return useQuery({ queryKey: eventBudgetKey(eventId ?? ''), queryFn: () => budgetApi.forEvent(eventId!), enabled: Boolean(eventId) })
}

/** Store a fresh plan and refresh what depends on it (event cards, progress, the budget list). */
function usePlanSettled(eventId: string) {
  const qc = useQueryClient()
  return (plan?: BudgetPlanDto) => {
    // Autosaves that keep the target only need the budget list refreshed, not every event.
    const before = qc.getQueryData<EventBudgetResponse>(eventBudgetKey(eventId))?.plan
    const light = Boolean(plan && before && before.targetPkr === plan.targetPkr && before.status === plan.status && before.lines.length > 0 === plan.lines.length > 0)
    if (plan) {
      qc.setQueryData<EventBudgetResponse>(eventBudgetKey(eventId), (prev) =>
        prev ? { ...prev, plan } : { plan, suggestedTargetPkr: plan.targetPkr, hasMoodboard: false },
      )
    }
    void qc.invalidateQueries({ queryKey: budgetsKey })
    if (!light) void qc.invalidateQueries({ queryKey: eventsKey, predicate: (q) => q.queryKey[2] !== 'budget' && q.queryKey[2] !== 'questionnaire' })
  }
}

export function useBudgetActions(eventId: string) {
  const settled = usePlanSettled(eventId)
  const qc = useQueryClient()
  return {
    create: useMutation({ mutationFn: (body: CreateBudgetBody) => budgetApi.create(eventId, body), onSuccess: (r) => settled(r.plan) }),
    save: useMutation({ mutationFn: (body: PutBudgetBody) => budgetApi.save(eventId, body), onSuccess: (p) => settled(p) }),
    addLine: useMutation({ mutationFn: (body: AddBudgetLineBody) => budgetApi.addLine(eventId, body), onSuccess: (p) => settled(p) }),
    reset: useMutation({ mutationFn: () => budgetApi.reset(eventId), onSuccess: (p) => settled(p) }),
    reprice: useMutation({ mutationFn: () => budgetApi.reprice(eventId), onSuccess: (p) => settled(p) }),
    sendToConsultant: useMutation({ mutationFn: (note?: string) => budgetApi.sendToConsultant(eventId, note), onSuccess: (r) => settled(r.plan) }),
    quote: useMutation({
      mutationFn: (note?: string) => budgetApi.quote(eventId, note),
      // The plan's status moves to "submitted" on the server: refetch it.
      onSuccess: () => {
        settled()
        void qc.invalidateQueries({ queryKey: eventBudgetKey(eventId) })
      },
    }),
  }
}

/** Moodboard → budget ("Add to budget" on a tile, "Apply to budget" for the whole concept). */
export function useMoodboardBudget(eventId: string) {
  const settled = usePlanSettled(eventId)
  const qc = useQueryClient()
  return {
    addPiece: useMutation({
      mutationFn: (v: { inventoryItemId: string; area?: string }) => budgetApi.addLine(eventId, { ...v, source: 'moodboard' }),
      onSuccess: (p) => settled(p),
    }),
    applyConcept: useMutation({
      mutationFn: budgetApi.applyMoodboard,
      onSuccess: (r) => {
        settled(r.plan)
        void qc.invalidateQueries({ queryKey: eventBudgetKey(eventId) })
      },
    }),
  }
}
