import { describe, expect, it } from 'vitest'
import { deriveNextStep, deriveProgress, deriveStatus, overallProgressPercent, todayIso } from './progress'

const none = { questionnaire: null, moodboards: [], budgetPlan: null, arSet: null }

describe('deriveProgress', () => {
  it('is all pending for a brand-new event', () => {
    expect(deriveProgress(none)).toEqual({
      questionnaire: 'pending',
      moodboard: 'pending',
      budget: 'pending',
      ar: 'pending',
    })
  })

  it('maps each module', () => {
    expect(
      deriveProgress({
        questionnaire: { percentComplete: 40, submittedAt: null },
        moodboards: [{ status: 'DRAFT', isPrimary: false }],
        budgetPlan: { status: 'SUBMITTED' },
        arSet: { status: 'RENDERING' },
      }),
    ).toEqual({ questionnaire: 'in_progress', moodboard: 'in_progress', budget: 'complete', ar: 'in_progress' })
  })

  it('treats a submitted questionnaire and a saved primary concept as complete', () => {
    const p = deriveProgress({
      ...none,
      questionnaire: { percentComplete: 80, submittedAt: '2026-10-01T00:00:00Z' },
      moodboards: [{ status: 'SAVED', isPrimary: true }],
    })
    expect(p.questionnaire).toBe('complete')
    expect(p.moodboard).toBe('complete')
  })

  it('ignores archived moodboards', () => {
    expect(deriveProgress({ ...none, moodboards: [{ status: 'ARCHIVED', isPrimary: false }] }).moodboard).toBe('pending')
  })
})

describe('deriveStatus', () => {
  it.each([
    ['ARCHIVED', '2030-01-01', 'archived'],
    ['ACTIVE', '2020-01-01', 'past'],
    ['DRAFT', '2030-01-01', 'draft'],
    ['ACTIVE', '2030-01-01', 'active'],
    ['ACTIVE', '2026-10-12', 'active'], // today is not past
  ] as const)('%s on %s → %s', (stored, date, expected) => {
    expect(deriveStatus(stored, date, '2026-10-12')).toBe(expected)
  })

  it('computes today in Pakistan time', () => {
    // 20:00 UTC on 12 Oct is already 13 Oct in Karachi (UTC+5).
    expect(todayIso(new Date('2026-10-12T20:00:00Z'))).toBe('2026-10-13')
  })
})

describe('next step and overall percent', () => {
  it('walks questionnaire → moodboard → budget → AR → done', () => {
    const base = { questionnaire: 'complete', moodboard: 'complete', budget: 'complete', ar: 'complete' } as const
    expect(deriveNextStep('e1', { ...base, questionnaire: 'pending' }, 0).href).toBe('/events/e1/questionnaire')
    expect(deriveNextStep('e1', { ...base, moodboard: 'in_progress' }, 100).href).toBe('/events/e1?tab=moodboard')
    expect(deriveNextStep('e1', { ...base, budget: 'pending' }, 100).href).toBe('/events/e1/budget')
    expect(deriveNextStep('e1', { ...base, ar: 'pending' }, 100).href).toBe('/events/e1/ar')
    expect(deriveNextStep('e1', base, 100).href).toBe('/events/e1')
  })

  it('weights in-progress modules as half', () => {
    expect(
      overallProgressPercent({ questionnaire: 'complete', moodboard: 'in_progress', budget: 'in_progress', ar: 'pending' }),
    ).toBe(50)
  })
})
