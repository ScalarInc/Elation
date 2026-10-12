import { describe, expect, it } from 'vitest'
import { categories, questionById, questions, visibleQuestions } from './schema'
import { answerSchemaFor, missingRequired, validateAnswers, visibleAnswers } from './validate'

describe('question set', () => {
  it('has all 134 questions from the brief, numbered 1–134 in order', () => {
    expect(questions).toHaveLength(134)
    questions.forEach((q, i) => expect(q.id).toMatch(new RegExp(`^q${i + 1}_[a-z0-9_]+$`)))
  })

  it('puts every question in a known category, in category order', () => {
    const order = new Map(categories.map((c) => [c.title, c.order]))
    let last = 0
    for (const q of questions) {
      const o = order.get(q.category)
      expect(o, q.id).toBeDefined()
      expect(o!).toBeGreaterThanOrEqual(last)
      last = o!
    }
  })

  it('gives every chip question options', () => {
    for (const q of questions.filter((x) => ['single', 'multi', 'range-select'].includes(x.kind))) {
      expect(q.options?.length, q.id).toBeGreaterThan(1)
    }
  })
})

describe('branching (docx "Implementation Notes for IT Team")', () => {
  const gates: [string, string][] = [
    ['q22_entrance', 'Entrance'],
    ['q29_stage', 'Stage'],
    ['q40_dance', 'Dance Floor'],
    ['q46_ceiling', 'Ceiling / Roof'],
    ['q56_floor', 'Floor Seating'],
    ['q61_tables', 'Tables & Dining'],
    ['q71_lounges', 'Lounges'],
    ['q76_florals', 'Florals'],
    ['q90_fabric', 'Fabric & Draping'],
    ['q95_structures', 'Backdrops & Structures'],
    ['q102_photo', 'Photo / Content Area'],
    ['q106_signage', 'Signage & Branding'],
  ]

  it.each(gates)('answering No to %s hides every %s follow-up', (gate, category) => {
    const visible = new Set(visibleQuestions(questions, { [gate]: 'No' }).map((q) => q.id))
    const followUps = questions.filter((q) => q.category === category && q.id !== gate)
    expect(followUps.length).toBeGreaterThan(0)
    for (const q of followUps) expect(visible.has(q.id), q.id).toBe(false)
    expect(visible.has(gate)).toBe(true)
  })

  it('handles nested follow-ups', () => {
    const ids = (a: Record<string, unknown>) => new Set(visibleQuestions(questions, a).map((q) => q.id))
    expect(ids({ q33_stage_frames: 'No' }).has('q34_frame_style')).toBe(false)
    expect(ids({ q33_stage_frames: 'Yes' }).has('q34_frame_style')).toBe(true)
    expect(ids({ q35_stage_florals: 'No Florals' }).has('q36_floral_arrangement')).toBe(false)
    expect(ids({ q84_chandeliers: 'Yes' }).has('q85_chandelier_style')).toBe(true)
    expect(ids({ q99_installations: ['None'] }).has('q100_installation_importance')).toBe(false)
  })

  it('every showIf only depends on real question ids', () => {
    // Evaluate each predicate with a proxy that records which keys it reads.
    for (const q of questions.filter((x) => x.showIf)) {
      const read = new Set<string>()
      q.showIf!(new Proxy({}, { get: (_, k) => (read.add(String(k)), undefined) }))
      for (const k of read) expect(questionById.has(k), `${q.id} reads ${k}`).toBe(true)
    }
  })
})

describe('validation', () => {
  it('accepts well-formed answers of every kind', () => {
    expect(
      validateAnswers({
        q1_type: 'Mehndi',
        q3_date: '2026-12-14',
        q4_guests: 320,
        q7_dimensions: { w: 120, d: 90 },
        q8_upload: ['venue.pdf'],
        q10_aesthetic: ['Romantic', 'Soft'],
        q16_colours: { desc: 'Blush and sage', hex: ['#E3BFB9'] },
        q121_budget: 'PKR 2M–5M',
        q134_dream: 'Candles everywhere.',
      }),
    ).toEqual([])
  })

  it('rejects unknown ids, unknown options and wrong shapes', () => {
    const issues = validateAnswers({
      q999_nope: 'x',
      q1_type: 'Rave',
      q10_aesthetic: 'Romantic',
      q16_colours: { hex: ['pink'] },
      q4_guests: -5,
    })
    expect(issues.map((i) => i.qid).sort()).toEqual(['q10_aesthetic', 'q16_colours', 'q1_type', 'q4_guests', 'q999_nope'])
  })

  it('has a schema for every question', () => {
    for (const q of questions) expect(answerSchemaFor(q), q.id).toBeDefined()
  })

  it('keeps hidden answers out of visibleAnswers', () => {
    const answers = { q46_ceiling: 'No', q47_ceiling_type: ['Chandeliers'], q1_type: 'Mehndi' }
    expect(visibleAnswers(answers)).toEqual({ q46_ceiling: 'No', q1_type: 'Mehndi' })
  })

  it('lists required visible questions that are still missing', () => {
    const missing = missingRequired({ q1_type: 'Mehndi', q29_stage: 'No' }, { q130_control: true })
    expect(missing).toContain('q3_date')
    expect(missing).not.toContain('q1_type')
    expect(missing).not.toContain('q130_control') // handed to Elation
  })
})
