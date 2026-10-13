import { describe, expect, it } from 'vitest'
import { classifyBudget } from './classify'

describe('classifyBudget', () => {
  const target = 2_500_000

  it.each([
    [2_500_000, 'green'],
    [2_550_000, 'green'], // exactly +2 %
    [2_550_001, 'red'],
    [2_125_000, 'green'], // exactly −15 %
    [2_124_999, 'yellow'],
    [1_000_000, 'yellow'],
    [4_000_000, 'red'],
  ] as const)('total %i → %s', (total, state) => {
    expect(classifyBudget(total, target).state).toBe(state)
  })

  it('reports delta and ratio', () => {
    expect(classifyBudget(2_750_000, target)).toMatchObject({ deltaPkr: 250_000, ratio: 1.1 })
  })

  it('treats a missing target as red once anything is spent', () => {
    expect(classifyBudget(0, 0).state).toBe('green')
    expect(classifyBudget(10, 0).state).toBe('red')
  })
})
