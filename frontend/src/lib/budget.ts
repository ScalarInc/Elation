import type { BudgetStatus } from '@/types'

/**
 * Traffic light, identical to the backend's `classify_budget`:
 * yellow below 90 % of target, green 90–100 % inclusive, red above 100 %. No tolerance.
 * The server's totals are authoritative; this only gives instant feedback while editing.
 */
export function classifyBudget(totalPkr: number, targetPkr: number | null): BudgetStatus {
  if (!targetPkr) return 'noTarget'
  if (totalPkr > targetPkr) return 'red'
  if (10 * totalPkr >= 9 * targetPkr) return 'green'
  return 'yellow'
}

export const BUDGET_STATUS_LABEL: Record<BudgetStatus, string> = {
  green: 'On budget',
  yellow: 'Under budget',
  red: 'Over budget',
  noTarget: 'No target set',
}
