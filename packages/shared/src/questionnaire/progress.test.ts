import { describe, expect, it } from 'vitest'
import { computeCategoryProgress, computeOverallPercent, isAnswered } from './progress'
import { questions, visibleQuestions } from './schema'

describe('isAnswered', () => {
  it.each([
    [undefined, false],
    ['', false],
    [[], false],
    [{ hex: [], desc: '' }, true], // empty array counts as a defined value inside an object
    ['Mehndi', true],
    [0, true],
    [['Gold'], true],
    [{ desc: 'blush' }, true],
  ])('%j → %s', (value, expected) => {
    expect(isAnswered(value)).toBe(expected)
  })
})

describe('branching', () => {
  it('hides ceiling follow-ups when the client says no ceiling décor', () => {
    const visible = visibleQuestions(questions, { q46_ceiling: 'No' }).map((q) => q.id)
    const followUps = questions
      .filter((q) => q.category === 'Ceiling / Roof' && q.id !== 'q46_ceiling')
      .map((q) => q.id)
    expect(followUps.length).toBeGreaterThan(0)
    for (const id of followUps) expect(visible).not.toContain(id)
  })
})

describe('progress', () => {
  it('is 0 % for an empty questionnaire', () => {
    expect(computeOverallPercent(computeCategoryProgress({}, {}))).toBe(0)
  })

  it('counts "Elation decides" as answered', () => {
    const progress = computeCategoryProgress({}, { q2_name: true })
    const basics = progress.find((c) => c.slug === 'event-basics')
    expect(basics?.answeredCount).toBe(1)
  })
})
