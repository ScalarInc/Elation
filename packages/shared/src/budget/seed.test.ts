import { describe, expect, it } from 'vitest'
import { budgetCategoryFor } from './categories'
import { fitToTarget, seedBudgetLines, seedQuantity } from './seed'
import { budgetTotals } from './totals'

const q = (category: Parameters<typeof seedQuantity>[0]['category'], area: string | null, guests: number, answers = {}, unit = 'each') =>
  seedQuantity({ category, unit, area, guests, answers })

describe('seedQuantity', () => {
  it.each([
    [50, 50, 5, 1],
    [320, 320, 32, 2],
    [800, 800, 80, 5],
  ])('%i guests → %i chairs, %i tables, %i chandeliers', (guests, chairs, tables, chandeliers) => {
    expect(q('Chair', 'dining', guests)).toBe(chairs)
    expect(q('Table', 'dining', guests)).toBe(tables)
    expect(q('Floral', 'dining', guests)).toBe(tables)
    expect(q('Chandelier', 'ceiling', guests)).toBe(chandeliers)
  })

  it('takes floor seating off the chair count, sizes fabric by guests, one backdrop', () => {
    expect(q('Chair', 'dining', 300, { q56_floor: 'Yes' })).toBe(210)
    expect(q('Fabric', 'ceiling', 300, {}, 'linear ft')).toBe(600)
    expect(q('Floral', 'ceiling', 300, {}, 'linear ft')).toBe(40)
    expect(q('Backdrop', 'stage', 300)).toBe(1)
    expect(q('Sofa', 'stage', 300)).toBe(2)
  })
})

describe('seedBudgetLines', () => {
  it('skips unpriced pieces and duplicates, and groups by kind or area', () => {
    const { lines, unpriced } = seedBudgetLines(
      [
        { item: { id: 'a', category: 'Backdrop', unit: 'each', pricePkr: 100_000 }, area: 'stage' },
        { item: { id: 'a', category: 'Backdrop', unit: 'each', pricePkr: 100_000 }, area: 'stage' },
        { item: { id: 'b', category: 'Prop', unit: 'each', pricePkr: null }, area: 'entrance' },
        { item: { id: 'c', category: 'Floral', unit: 'each', pricePkr: 2_000 }, area: 'stage' },
      ],
      { guests: 200, answers: {} },
    )
    expect(unpriced).toEqual(['b'])
    expect(lines).toEqual([
      { inventoryItemId: 'a', category: 'Stage', qty: 1, unitPricePkr: 100_000, included: true },
      { inventoryItemId: 'c', category: 'Florals', qty: 20, unitPricePkr: 2_000, included: true },
    ])
  })

  it('maps pieces to estimator groups', () => {
    expect(budgetCategoryFor('Prop', 'entrance')).toBe('Entrance')
    expect(budgetCategoryFor('Lighting', 'ceiling')).toBe('Ceiling')
    expect(budgetCategoryFor('Signage', null)).toBe('Stage')
  })
})

describe('fitToTarget', () => {
  it('switches off the priciest optional lines until the starter fits, never seating or tables', () => {
    const line = (id: string, category: 'Stage' | 'Florals' | 'Seating', qty: number, unitPricePkr: number) =>
      ({ inventoryItemId: id, category, qty, unitPricePkr, included: true })
    const fitted = fitToTarget([line('canopy', 'Florals', 40, 65_000), line('arch', 'Stage', 1, 220_000), line('chairs', 'Seating', 300, 950)], 600_000)
    expect(fitted.map((l) => [l.inventoryItemId, l.included])).toEqual([['canopy', false], ['arch', true], ['chairs', true]])
    expect(fitToTarget([line('chairs', 'Seating', 300, 950)], 1).every((l) => l.included)).toBe(true)
  })
})

describe('budgetTotals', () => {
  it('counts included lines only and sorts groups by spend', () => {
    const t = budgetTotals([
      { category: 'Stage', qty: 1, included: true, unitPricePkr: 500 },
      { category: 'Florals', qty: 10, included: true, unitPricePkr: 100 },
      { category: 'Seating', qty: 100, included: false, unitPricePkr: 100 },
    ])
    expect(t.includedPkr).toBe(1500)
    expect(t.byCategory.map((c) => c.category)).toEqual(['Florals', 'Stage'])
  })
})
