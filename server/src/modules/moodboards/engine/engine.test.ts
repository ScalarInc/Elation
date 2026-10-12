import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { MoodboardControls } from '@elation/shared/api'
import { deriveMoodboardDefaults } from '@elation/shared/moodboard'
import { parseCsvRecords } from '../../../lib/csv'
import { rowToWriteBody } from '../../inventory/service'
import { deltaE } from './colour'
import { buildSlots, excludedBy, generateConcepts, type EngineInput, type EngineItem } from './engine'

/** Elation's real (draft) catalogue — the engine is tested against what it will actually curate from. */
const catalogue: EngineItem[] = parseCsvRecords(
  readFileSync(fileURLToPath(new URL('../../../../prisma/seed/inventory-draft.csv', import.meta.url)), 'utf8'),
).map(({ record }) => {
  const b = rowToWriteBody(record).body!
  return {
    id: b.sku,
    name: b.name,
    category: b.category,
    colour: b.colour,
    colourHex: b.colourHex ?? null,
    material: b.material ?? null,
    pricePkr: b.pricePKR ?? null,
    imageUrl: b.image ?? null,
    stockQty: b.stockQty ?? null,
    tags: b.tags as string[],
    moodTags: (b.moodTags ?? []) as string[],
    styleTags: (b.styleTags ?? []) as string[],
    eventTypes: b.eventTypes ?? [],
    placeholder: false,
  }
})
const byId = new Map(catalogue.map((i) => [i.id, i]))

const controls: MoodboardControls = {
  mood: 'romantic',
  style: 'garden',
  palette: ['#F5EFD9', '#E3BFB9', '#9AB1AE'],
  density: 'Heavy',
  venue: 'Garden',
  venueLocked: true,
}

const input = (over: Partial<EngineInput> = {}): EngineInput => ({
  event: { type: 'Mehndi', guests: 300, budgetPkr: 2_500_000, concept: 'Whispers of Noor' },
  answers: { q9_areas: ['Entrance', 'Main Stage', 'Dining', 'Ceiling'] },
  controls,
  inventory: catalogue,
  variants: 3,
  seed: 'test-seed',
  ...over,
})

const items = (c: { tiles: { itemId: string | null }[] }) => c.tiles.map((t) => byId.get(t.itemId!)!).filter(Boolean)

describe('slots', () => {
  it('follows Q9 areas and the Yes/No gates', () => {
    const areas = (a: Record<string, unknown>) => [...new Set(buildSlots(a).map((s) => s.area))]
    expect(areas({ q9_areas: ['Entrance', 'Main Stage', 'Ceiling'] })).toEqual(['stage', 'entrance', 'ceiling'])
    expect(areas({ q9_areas: ['Entrance', 'Main Stage', 'Ceiling'], q46_ceiling: 'No' })).not.toContain('ceiling')
    expect(areas({ q9_areas: ['Main Stage'], q71_lounges: 'Yes' })).toContain('lounge')
    expect(areas({ q9_areas: ['Main Stage'], q29_stage: 'No' })).not.toContain('stage')
  })

  it('drops floral slots for a florally-averse client and stage seating when declined', () => {
    const slots = buildSlots({ q9_areas: ['Main Stage', 'Dining'], q76_florals: 'No', q37_stage_seating: 'No' })
    expect(slots.flatMap((s) => s.categories)).not.toContain('Floral')
    expect(slots.some((s) => s.area === 'stage' && s.categories.includes('Sofa'))).toBe(false)
  })

  it('always fills at least six tiles and never more than twelve', () => {
    expect(buildSlots({ q9_areas: ['Photo Area'] }).length).toBeGreaterThanOrEqual(6)
    expect(buildSlots({ q9_areas: ['Entrance', 'Main Stage', 'Seating', 'Dining', 'Dance Floor', 'Walkway', 'Ceiling', 'Walls', 'Photo Area'], q71_lounges: 'Yes', q56_floor: 'Yes' }).length).toBeLessThanOrEqual(12)
  })
})

describe('hard filters', () => {
  it('keeps hanging pieces and chandeliers off the board when the client said no ceiling décor', () => {
    const answers = { q9_areas: ['Main Stage', 'Entrance', 'Dance Floor', 'Ceiling'], q46_ceiling: 'No' }
    for (const c of generateConcepts(input({ answers }))) {
      expect(items(c).some((i) => i.tags[0] === 'ceiling' || i.category === 'Chandelier')).toBe(false)
    }
    expect(excludedBy(byId.get('S1-P13')!, answers, 'Mehndi')).toBe('no ceiling décor')
    expect(excludedBy(byId.get('S2-P26')!, answers, 'Mehndi')).toBeNull()
  })

  it('never shows florals to a client who said no to florals', () => {
    const [a] = generateConcepts(input({ answers: { q9_areas: ['Main Stage', 'Entrance', 'Dining'], q76_florals: 'No' } }))
    expect(items(a).some((i) => i.category === 'Floral')).toBe(false)
  })

  it('respects colours to avoid and the absolute-no list', () => {
    const answers = { q9_areas: ['Main Stage', 'Entrance', 'Dining'], q19_avoid_colours: 'yellow, black', q126_no: 'no swans please' }
    for (const concept of generateConcepts(input({ answers }))) {
      for (const i of items(concept)) {
        expect(i.colour.toLowerCase()).not.toContain('yellow')
        expect(i.colour.toLowerCase()).not.toContain('black')
        expect(i.name.toLowerCase()).not.toContain('swan')
      }
    }
    expect(excludedBy(byId.get('S1-P17')!, answers, 'Mehndi')).toMatch(/absolute no/)
  })

  it('skips items reserved for other event types', () => {
    const [a] = generateConcepts(input({ event: { type: 'Corporate Event', guests: 100, budgetPkr: null, concept: null } }))
    expect(items(a).every((i) => i.eventTypes.length === 0 || i.eventTypes.includes('Corporate Event'))).toBe(true)
  })
})

describe('concepts', () => {
  it('is deterministic for a seed', () => {
    expect(generateConcepts(input())).toEqual(generateConcepts(input()))
  })

  it('makes three distinct concepts (B and C differ from A in at least 30 % of tiles)', () => {
    const [a, b, c] = generateConcepts(input())
    expect([a.variantLabel, b.variantLabel, c.variantLabel]).toEqual(['A', 'B', 'C'])
    for (const other of [b, c]) {
      const same = other.tiles.filter((t, i) => t.itemId === a.tiles[i]?.itemId).length
      expect(same / a.tiles.length).toBeLessThanOrEqual(0.7)
    }
    expect(b.title).toMatch(/^Whispers of Noor — /)
  })

  it('never repeats a piece within a concept and explains every pick', () => {
    for (const concept of generateConcepts(input())) {
      const ids = concept.tiles.map((t) => t.itemId)
      expect(new Set(ids).size).toBe(ids.length)
      for (const t of concept.tiles) expect(t.reasons.length).toBeGreaterThan(0)
    }
  })

  it('stays on palette: most coloured tiles sit close to a palette colour', () => {
    const [a] = generateConcepts(input())
    const coloured = items(a).filter((i) => i.colourHex)
    const close = coloured.filter((i) => controls.palette.some((p) => deltaE(i.colourHex!, p) < 25))
    expect(close.length / coloured.length).toBeGreaterThanOrEqual(0.6)
  })

  it('keeps locked tiles in every concept, whatever position the client dragged them to', () => {
    const lockedTiles = [{ position: 7, area: 'stage', itemId: 'S4-P42', imageUrl: '/media/inventory/S4-P42.jpg' }]
    for (const concept of generateConcepts(input({ lockedTiles }))) {
      expect(concept.tiles.find((t) => t.itemId === 'S4-P42')).toMatchObject({ area: 'stage', locked: true })
    }
    // Its area left the brief: still kept, not silently dropped.
    const [a] = generateConcepts(input({ answers: { q9_areas: ['Dining'] }, lockedTiles }))
    expect(a.tiles.some((t) => t.itemId === 'S4-P42' && t.locked)).toBe(true)
  })

  it('drops a pin that now breaks a hard filter', () => {
    const lockedTiles = [{ position: 0, area: 'stage', itemId: 'S1-P16', imageUrl: '/media/inventory/S1-P16.jpg' }]
    const [a] = generateConcepts(input({ answers: { q9_areas: ['Main Stage'], q76_florals: 'No' }, lockedTiles }))
    expect(a.tiles.some((t) => t.itemId === 'S1-P16')).toBe(false)
  })

  it('golden: the demo questionnaires produce full, on-brief boards', () => {
    const fixtures = JSON.parse(readFileSync(fileURLToPath(new URL('../../../../prisma/seed/fixtures.json', import.meta.url)), 'utf8'))
    for (const [key, seed] of Object.entries<{ answers: Record<string, unknown> }>(fixtures.questionnaireSeeds)) {
      const defaults = deriveMoodboardDefaults(seed.answers)
      const concepts = generateConcepts(
        input({ answers: seed.answers, controls: defaults.controls, seed: key, event: { type: (seed.answers.q1_type as 'Mehndi') ?? 'Mehndi', guests: 300, budgetPkr: 3_000_000, concept: null } }),
      )
      for (const concept of concepts) {
        expect(concept.tiles.length, key).toBeGreaterThanOrEqual(6)
        if (seed.answers.q46_ceiling === 'No') expect(concept.tiles.some((t) => t.area === 'ceiling')).toBe(false)
      }
    }
  })
})
