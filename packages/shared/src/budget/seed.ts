import type { InventoryCategory } from '../domain/enums'
import type { Answers } from '../questionnaire/types'
import { budgetCategoryFor, type BudgetCategory } from './categories'

/**
 * Starter quantities for a budget line (docs/step-08-budget.md, "Seeding rules").
 * Deliberately simple and explainable — the consultant tunes from here.
 */
export function seedQuantity(input: {
  category: InventoryCategory
  unit: string
  area: string | null
  guests: number
  answers: Answers
}): number {
  const guests = Math.max(1, input.guests)
  const tables = Math.ceil(guests / 10)
  const { category, area, answers } = input
  // Draping runs with the room (≈ 2 ft per guest); other pieces sold by the foot start at one 40 ft feature run
  // (decision P29 — a canopy priced per foot at 2 ft/guest lands far outside any target).
  if (input.unit === 'linear ft' || input.unit === 'sqft') return category === 'Fabric' ? guests * 2 : 40
  switch (category) {
    case 'Chair':
      // Floor seating takes about a third of the guests off chairs.
      return answers.q56_floor === 'Yes' ? Math.ceil(guests * 0.7) : guests
    case 'Table':
      return tables
    case 'Chandelier':
      return Math.max(1, Math.round(guests / 150))
    case 'Sofa':
      return area === 'stage' ? 2 : Math.max(1, Math.ceil(guests / 50))
    case 'Floral':
      return area === 'dining' ? tables : area === 'stage' ? 20 : 10
    case 'Lighting':
      return area === 'dining' ? tables : 6
    case 'Backdrop':
      return 1
    default:
      // Entrance pieces only reach here when the client wants entrance décor (Q22 gates the slot upstream).
      return 1
  }
}

export type SeedPick = {
  item: { id: string; category: InventoryCategory; unit: string; pricePkr: number | null }
  area: string | null
}
export type SeededLine = { inventoryItemId: string; category: BudgetCategory; qty: number; unitPricePkr: number; included: boolean }

/** Turn picked pieces into budget lines; pieces without a price are returned separately ("price on request"). */
export function seedBudgetLines(picks: SeedPick[], ctx: { guests: number; answers: Answers }) {
  const lines: SeededLine[] = []
  const unpriced: string[] = []
  const seen = new Set<string>()
  for (const { item, area } of picks) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    if (item.pricePkr == null) {
      unpriced.push(item.id)
      continue
    }
    lines.push({
      inventoryItemId: item.id,
      category: budgetCategoryFor(item.category, area),
      qty: seedQuantity({ category: item.category, unit: item.unit, area, guests: ctx.guests, answers: ctx.answers }),
      unitPricePkr: item.pricePkr,
      included: true,
    })
  }
  return { lines, unpriced }
}

/** Seating and tables are never switched off by {@link fitToTarget}. */
const ESSENTIAL: BudgetCategory[] = ['Seating', 'Dining']

/**
 * A starter budget should land on target: switch off the most expensive optional
 * lines until the total is within the target. They stay in the plan, so the
 * client can switch them back on.
 */
export function fitToTarget(lines: SeededLine[], targetPkr: number): SeededLine[] {
  if (targetPkr <= 0) return lines
  let total = lines.reduce((sum, l) => sum + l.qty * l.unitPricePkr, 0)
  const off = new Set<string>()
  const optional = lines
    .filter((l) => !ESSENTIAL.includes(l.category))
    .sort((a, b) => b.qty * b.unitPricePkr - a.qty * a.unitPricePkr)
  for (const l of optional) {
    if (total <= targetPkr) break
    off.add(l.inventoryItemId)
    total -= l.qty * l.unitPricePkr
  }
  return lines.map((l) => (off.has(l.inventoryItemId) ? { ...l, included: false } : l))
}
