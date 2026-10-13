import { describe, expect, it } from 'vitest'
import { applyPending, emptyPending, mergePending } from './store'

const p = (patch: Partial<ReturnType<typeof emptyPending>>) => ({ ...emptyPending(), ...patch })

describe('applyPending (local edits over a server copy)', () => {
  it('sets, clears and hands questions to Elation like the server does', () => {
    const out = applyPending(
      { q1_type: 'Mehndi', q2_name: 'Noor', q4_guests: 300 },
      { q12_theme: true },
      p({ set: { q4_guests: 450, q12_theme: 'Garden' }, clear: ['q1_type'], decides: { q2_name: true } }),
    )
    expect(out.answers).toEqual({ q4_guests: 450, q12_theme: 'Garden' })
    // An explicit answer cancels "Elation decides"; handing over removes the answer.
    expect(out.elationDecides).toEqual({ q2_name: true })
  })
})

describe('mergePending (edits made while a save is in flight)', () => {
  it('keeps the newest intent per question', () => {
    const older = p({ set: { q4_guests: 300, q2_name: 'Noor' }, clear: ['q12_theme'] })
    const newer = p({ set: { q12_theme: 'Garden' }, clear: ['q4_guests'], decides: { q2_name: true } })
    expect(mergePending(older, newer)).toEqual({
      set: { q12_theme: 'Garden' },
      clear: ['q4_guests'],
      decides: { q2_name: true },
    })
  })

  it('taking a question back from Elation does not drop an older answer', () => {
    const merged = mergePending(p({ set: { q2_name: 'Noor' } }), p({ decides: { q2_name: false } }))
    expect(merged).toEqual({ set: { q2_name: 'Noor' }, clear: [], decides: { q2_name: false } })
  })
})
