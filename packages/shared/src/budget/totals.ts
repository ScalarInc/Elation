import { BUDGET_CATEGORIES } from './categories'

export type PricedLine = { category: string; qty: number; included: boolean; unitPricePkr: number }
export type CategoryTotal = { category: string; totalPkr: number; count: number }
export type BudgetTotals = { includedPkr: number; byCategory: CategoryTotal[] }

/** Included lines only; groups sorted by spend, ties in the estimator's display order. */
export function budgetTotals(lines: PricedLine[]): BudgetTotals {
  const groups = new Map<string, CategoryTotal>()
  let includedPkr = 0
  for (const l of lines) {
    if (!l.included) continue
    const sub = l.unitPricePkr * l.qty
    includedPkr += sub
    const g = groups.get(l.category) ?? { category: l.category, totalPkr: 0, count: 0 }
    g.totalPkr += sub
    g.count += 1
    groups.set(l.category, g)
  }
  const order = (c: string) => {
    const i = (BUDGET_CATEGORIES as readonly string[]).indexOf(c)
    return i === -1 ? BUDGET_CATEGORIES.length : i
  }
  const byCategory = [...groups.values()].sort((a, b) => b.totalPkr - a.totalPkr || order(a.category) - order(b.category))
  return { includedPkr, byCategory }
}
