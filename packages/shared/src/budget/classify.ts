/**
 * Budget traffic light (decision P8, owner answer A2 — option B).
 * Spec: green = on budget, yellow = under budget, red = over budget.
 */
export type BudgetThresholds = {
  /** Totals above target × overTolerance are red. */
  overTolerance: number
  /** Totals below target × underFloor are yellow. */
  underFloor: number
}

export const DEFAULT_BUDGET_THRESHOLDS: BudgetThresholds = {
  overTolerance: 1.02,
  underFloor: 0.85,
}

export type BudgetState = 'green' | 'yellow' | 'red'

export type BudgetClassification = {
  state: BudgetState
  /** total / target; 0 when no target is set. */
  ratio: number
  /** total − target in PKR. Positive = over. */
  deltaPkr: number
}

export function classifyBudget(
  totalPkr: number,
  targetPkr: number,
  thresholds: BudgetThresholds = DEFAULT_BUDGET_THRESHOLDS,
): BudgetClassification {
  const deltaPkr = totalPkr - targetPkr
  if (targetPkr <= 0) {
    return { state: totalPkr > 0 ? 'red' : 'green', ratio: 0, deltaPkr }
  }
  const ratio = totalPkr / targetPkr
  let state: BudgetState = 'green'
  if (ratio > thresholds.overTolerance) state = 'red'
  else if (ratio < thresholds.underFloor) state = 'yellow'
  return { state, ratio, deltaPkr }
}
