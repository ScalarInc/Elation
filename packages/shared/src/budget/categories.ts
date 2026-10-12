import type { InventoryCategory } from '../domain/enums'

/** Display groups of the budget estimator, in their preferred order. */
export const BUDGET_CATEGORIES = ['Stage', 'Florals', 'Ceiling', 'Seating', 'Dining', 'Entrance', 'Lighting', 'Fabric'] as const
export type BudgetCategory = (typeof BUDGET_CATEGORIES)[number]

/** Which inventory categories the "Add to <group>" picker suggests first. */
export const BUDGET_CATEGORY_INVENTORY: Record<BudgetCategory, InventoryCategory[]> = {
  Stage: ['Backdrop', 'Sofa', 'Prop', 'Signage'],
  Florals: ['Floral'],
  Ceiling: ['Chandelier', 'Fabric'],
  Seating: ['Chair', 'Sofa'],
  Dining: ['Table', 'Chair', 'Floral'],
  Entrance: ['Prop', 'Signage', 'Lighting'],
  Lighting: ['Lighting', 'Chandelier'],
  Fabric: ['Fabric'],
}

const AREA_GROUP: Record<string, BudgetCategory> = {
  stage: 'Stage',
  'photo-area': 'Stage',
  entrance: 'Entrance',
  walkway: 'Entrance',
  ceiling: 'Ceiling',
  dining: 'Dining',
  lounge: 'Seating',
  'floor-seating': 'Seating',
  'dance-floor': 'Lighting',
  walls: 'Fabric',
}

/** The budget group a piece lands in: florals, seating, tables and lights by kind; the rest by where it's used. */
export function budgetCategoryFor(category: InventoryCategory, area?: string | null): BudgetCategory {
  switch (category) {
    case 'Floral':
      return 'Florals'
    case 'Chair':
      return 'Seating'
    case 'Table':
      return 'Dining'
    case 'Chandelier':
      return 'Ceiling'
    case 'Lighting':
      return area === 'ceiling' ? 'Ceiling' : 'Lighting'
    default:
      return (area && AREA_GROUP[area]) || (category === 'Fabric' ? 'Fabric' : category === 'Sofa' ? 'Seating' : 'Stage')
  }
}
