import type { MoodboardControls } from '@elation/shared/api'
import type { EventType, InventoryCategory } from '@elation/shared/domain'
import { MOOD_LABELS, STYLE_LABELS, type Mood, type Style } from '@elation/shared/domain'
import {
  florallyAverse,
  moodsFromAnswers,
  noCeilingDecor,
  stylesFromAnswers,
} from '@elation/shared/moodboard'
import { visibleAnswers, type Answers } from '@elation/shared/questionnaire'
import { colourName, deltaE } from './colour'

/**
 * Moodboard curation engine v1 — rules-based scoring (docs/step-07-moodboard.md, decision D3).
 * Pure and deterministic for a given seed: no I/O, no clock, no Math.random.
 */

export type EngineItem = {
  id: string
  name: string
  category: InventoryCategory
  colour: string
  colourHex: string | null
  material: string | null
  pricePkr: number | null
  imageUrl: string | null
  stockQty: number | null
  tags: string[]
  moodTags: string[]
  styleTags: string[]
  eventTypes: EventType[]
  /** Placeholder rows ("notes = placeholder") rank slightly below Elation's real pieces. */
  placeholder: boolean
}

export type EngineInput = {
  event: { type: EventType; guests: number | null; budgetPkr: number | null; concept: string | null }
  answers: Answers
  controls: MoodboardControls
  inventory: EngineItem[]
  /** Pinned tiles carried into every concept, matched to a slot by area (positions move when clients reorder). */
  lockedTiles?: { position: number; area: string | null; itemId: string | null; imageUrl: string | null }[]
  variants: 1 | 2 | 3
  seed: string
}

export type TileDraft = {
  position: number
  area: string
  itemId: string | null
  imageUrl: string | null
  score: number | null
  reasons: string[]
  locked: boolean
}

export type ConceptDraft = { variantLabel: string; title: string; palette: string[]; tiles: TileDraft[] }

export type Slot = { area: string; categories: InventoryCategory[] }

// ─────────────── weights (tune here; later an admin setting) ───────────────

export const WEIGHTS = {
  area: 3.0,
  mood: 2.0,
  style: 1.5,
  palette: 2.0,
  material: 1.0,
  metallic: 1.0,
  density: 0.8,
  eventType: 0.5,
  budget: 0.7,
  venue: 0.3,
  realItem: 0.4,
  stock: -1.0,
  /** Applied in variants B/C to pieces already used by concept A, so the concepts differ. */
  reuse: -1.2,
} as const

const MAX_TILES = 12
const MIN_TILES = 6

// ─────────────── slots: which areas need décor ───────────────

const AREA_FROM_Q9: Record<string, string> = {
  Entrance: 'entrance',
  'Main Stage': 'stage',
  Seating: 'dining',
  Dining: 'dining',
  'Dance Floor': 'dance-floor',
  Walkway: 'walkway',
  Ceiling: 'ceiling',
  Walls: 'walls',
  'Photo Area': 'photo-area',
  Buffet: 'dining',
  'Beverage Area': 'dining',
}

const TEMPLATES: Record<string, InventoryCategory[][]> = {
  stage: [['Backdrop'], ['Sofa', 'Chair'], ['Floral'], ['Prop']],
  entrance: [['Backdrop', 'Floral'], ['Lighting'], ['Prop']],
  ceiling: [['Chandelier', 'Lighting'], ['Floral', 'Fabric', 'Prop']],
  dining: [['Chair'], ['Table', 'Prop'], ['Floral', 'Lighting']],
  lounge: [['Sofa', 'Chair'], ['Table', 'Prop']],
  'floor-seating': [['Chair', 'Table']],
  'photo-area': [['Backdrop', 'Signage', 'Prop']],
  'dance-floor': [['Lighting', 'Prop']],
  walkway: [['Lighting', 'Floral']],
  walls: [['Backdrop', 'Fabric']],
}

const AREA_ORDER = ['stage', 'entrance', 'ceiling', 'dining', 'lounge', 'floor-seating', 'photo-area', 'walkway', 'dance-floor', 'walls']

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

export function buildSlots(answers: Answers): Slot[] {
  const a = answers
  const areas = new Set(strings(a.q9_areas).map((x) => AREA_FROM_Q9[x]).filter(Boolean))
  if (areas.size === 0) ['stage', 'entrance', 'dining', 'ceiling'].forEach((x) => areas.add(x))

  // Category gates: "Yes" adds the area, "No" removes it.
  const gate = (qid: string, area: string) => {
    if (a[qid] === 'Yes') areas.add(area)
    if (a[qid] === 'No') areas.delete(area)
  }
  gate('q22_entrance', 'entrance')
  gate('q29_stage', 'stage')
  gate('q46_ceiling', 'ceiling')
  gate('q61_tables', 'dining')
  gate('q71_lounges', 'lounge')
  gate('q56_floor', 'floor-seating')
  gate('q102_photo', 'photo-area')
  gate('q40_dance', 'dance-floor')

  const noFlorals = florallyAverse(a)
  const slots: Slot[] = []
  for (const area of AREA_ORDER.filter((x) => areas.has(x))) {
    for (const cats of TEMPLATES[area]) {
      let categories = cats
      if (noFlorals) categories = categories.filter((c) => c !== 'Floral')
      if (area === 'stage' && a.q35_stage_florals === 'No Florals') categories = categories.filter((c) => c !== 'Floral')
      if (area === 'stage' && a.q37_stage_seating === 'No' && cats.includes('Sofa')) continue
      if (area === 'ceiling' && a.q84_chandeliers === 'No') categories = categories.filter((c) => c !== 'Chandelier')
      if (categories.length) slots.push({ area, categories })
    }
  }
  // Fill thin boards with atmosphere pieces — never in an area the client said
  // "No" to, and never florals for a florally-averse client.
  const blocked = new Set<string>()
  const gates: [string, string][] = [
    ['q22_entrance', 'entrance'],
    ['q29_stage', 'stage'],
    ['q46_ceiling', 'ceiling'],
    ['q61_tables', 'dining'],
    ['q71_lounges', 'lounge'],
    ['q56_floor', 'floor-seating'],
    ['q102_photo', 'photo-area'],
    ['q40_dance', 'dance-floor'],
  ]
  for (const [qid, area] of gates) if (a[qid] === 'No') blocked.add(area)

  const fillers: Slot[] = [
    { area: 'dining', categories: ['Lighting'] },
    { area: 'stage', categories: ['Prop'] },
    { area: 'walls', categories: ['Fabric', 'Backdrop'] },
    { area: 'entrance', categories: ['Lighting', 'Prop'] },
    { area: 'dining', categories: ['Floral', 'Prop'] },
    { area: 'entrance', categories: ['Floral', 'Backdrop'] },
    { area: 'walls', categories: ['Prop'] },
    { area: 'walkway', categories: ['Lighting', 'Prop'] },
  ]
  for (const f of fillers) {
    if (slots.length >= MIN_TILES) break
    if (blocked.has(f.area)) continue
    const categories = noFlorals ? f.categories.filter((c) => c !== 'Floral') : f.categories
    if (categories.length) slots.push({ area: f.area, categories })
  }
  return slots.slice(0, MAX_TILES)
}

// ─────────────── hard filters ───────────────

const STOPWORDS = new Set(['with', 'that', 'this', 'them', 'they', 'have', 'from', 'what', 'want', 'dont', "don't", 'none', 'anything', 'nothing', 'really', 'very', 'please', 'like', 'just', 'more', 'less', 'much', 'also', 'into', 'over', 'colours', 'colors', 'colour', 'color'])

function keywords(...texts: unknown[]): string[] {
  const words = new Set<string>()
  for (const t of texts) {
    if (typeof t !== 'string') continue
    for (const w of t.toLowerCase().split(/[^a-z]+/)) if (w.length >= 4 && !STOPWORDS.has(w)) words.add(w)
  }
  return [...words]
}

const singular = (w: string) => w.replace(/(es|s)$/, '')

export function excludedBy(item: EngineItem, answers: Answers, eventType: EventType): string | null {
  if (florallyAverse(answers) && item.category === 'Floral') return 'client declined florals'
  // An item's first area tag is its main use; hanging pieces (and chandeliers) go when the client said no ceiling décor.
  if (noCeilingDecor(answers) && (item.tags[0] === 'ceiling' || item.category === 'Chandelier')) return 'no ceiling décor'
  if (item.eventTypes.length && !item.eventTypes.includes(eventType)) return `not used for ${eventType}`

  const avoidColours = keywords(answers.q19_avoid_colours)
  const colour = item.colour.toLowerCase()
  const hitColour = avoidColours.find((w) => colour.includes(singular(w)))
  if (hitColour) return `colour to avoid: ${hitColour}`

  const nos = keywords(answers.q15_reference_dislikes, answers.q126_no, answers.q127_dislike)
  const name = item.name.toLowerCase()
  const hitNo = nos.find((w) => name.split(/[^a-z]+/).some((n) => n.length >= 4 && singular(n) === singular(w)))
  if (hitNo) return `on the "absolute no" list: ${hitNo}`
  return null
}

// ─────────────── scoring ───────────────

type Context = {
  moods: Mood[] // primary first
  styles: Style[]
  palette: string[] // emphasis order
  materials: string[]
  metallic: string | null
  density: MoodboardControls['density']
  venue: MoodboardControls['venue']
  eventType: EventType
  budgetPerSlot: number | null
  guests: number
}


/** Quantity a slot of this category needs (drives stock checks). */
function neededQty(category: InventoryCategory, guests: number) {
  if (category === 'Chair') return Math.max(1, guests)
  if (category === 'Table') return Math.max(1, Math.ceil(guests / 10))
  return 1
}

export function scoreItem(item: EngineItem, slot: Slot, ctx: Context): { score: number; reasons: string[] } {
  let score = 0
  const reasons: string[] = []
  const add = (points: number, reason?: string) => {
    score += points
    if (reason && points >= 0.3) reasons.push(reason)
  }

  if (item.tags.includes(slot.area)) add(WEIGHTS.area, `area: ${slot.area.replace('-', ' ')}`)

  const moodHits: number[] = ctx.moods.map((m, i) => (item.moodTags.includes(m) ? (i === 0 ? 1 : 0.5) : 0))
  const mood = Math.min(1, moodHits.reduce((s, x) => s + x, 0))
  const topMood = ctx.moods.find((m) => item.moodTags.includes(m))
  if (mood > 0) add(WEIGHTS.mood * mood, `mood: ${MOOD_LABELS[topMood!].toLowerCase()}`)

  const styleHits: number[] = ctx.styles.map((s, i) => (item.styleTags.includes(s) ? (i === 0 ? 1 : 0.5) : 0))
  const style = Math.min(1, styleHits.reduce((s, x) => s + x, 0))
  const topStyle = ctx.styles.find((s) => item.styleTags.includes(s))
  if (style > 0) add(WEIGHTS.style * style, `style: ${STYLE_LABELS[topStyle!].toLowerCase()}`)

  if (item.colourHex && ctx.palette.length) {
    // The first palette colour carries full weight; the rest 70 % (variants rotate the emphasis).
    let best = 0
    let bestHex = ctx.palette[0]
    ctx.palette.forEach((hex, i) => {
      const fit = Math.max(0, 1 - deltaE(item.colourHex!, hex) / 50) * (i === 0 ? 1 : 0.7)
      if (fit > best) {
        best = fit
        bestHex = hex
      }
    })
    add(WEIGHTS.palette * best, `palette: ${colourName(bestHex).toLowerCase()} (${bestHex.toUpperCase()})`)
  } else if (!item.colourHex) {
    add(WEIGHTS.palette * 0.3)
  }

  const material = (item.material ?? '').toLowerCase()
  const materialHit = ctx.materials.find((m) => material.includes(m))
  if (materialHit) add(WEIGHTS.material, `material: ${materialHit}`)

  if (ctx.metallic) {
    const colour = item.colour.toLowerCase()
    if (colour.includes(ctx.metallic) || (ctx.metallic === 'gold' && /brass|champagne/.test(colour))) {
      add(WEIGHTS.metallic, `metallic: ${ctx.metallic}`)
    }
  }

  if (item.category === 'Floral') {
    const d = { Minimal: -0.5, Moderate: 0.3, Heavy: 1, 'Extremely Floral': 1.2 }[ctx.density]
    add(WEIGHTS.density * d, d > 0.5 ? `${ctx.density.toLowerCase()} florals` : undefined)
  }

  if (item.eventTypes.includes(ctx.eventType)) add(WEIGHTS.eventType, `made for ${ctx.eventType}`)

  if (ctx.venue === 'Garden' || ctx.venue === 'Hilltop Outdoor') {
    if (item.styleTags.includes('garden')) add(WEIGHTS.venue)
  } else if (item.styleTags.includes('architectural') || item.styleTags.includes('modern-luxury')) {
    add(WEIGHTS.venue)
  }

  if (!item.placeholder) add(WEIGHTS.realItem)

  if (ctx.budgetPerSlot && item.pricePkr != null) {
    const cost = item.pricePkr * neededQty(item.category, ctx.guests)
    const fit = cost <= ctx.budgetPerSlot ? 1 : cost <= 2 * ctx.budgetPerSlot ? 0.5 : 0
    add(WEIGHTS.budget * fit, fit === 1 ? 'within budget' : undefined)
  } else {
    add(WEIGHTS.budget * 0.5) // unpriced or no budget yet: neutral
  }

  if (item.stockQty != null && item.stockQty < neededQty(item.category, ctx.guests)) {
    add(WEIGHTS.stock)
  }

  return { score: Math.round(score * 1000) / 1000, reasons }
}

// ─────────────── randomness (seeded) ───────────────

function hashSeed(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

function rng(seed: string) {
  let t = hashSeed(seed)
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

/** Near-tie band: more creative freedom = wider band = more surprising picks. */
export function tieBand(answers: Answers): number {
  const control = String(answers.q130_control ?? '')
  const approach = String(answers.q131_approach ?? '')
  if (approach.startsWith('Surprise') || control.startsWith('Elation has maximum')) return 0.15
  if (control.startsWith('Elation can take')) return 0.1
  if (control.startsWith('I want to control') || approach.startsWith('Exact')) return 0.02
  return 0.05
}

// ─────────────── concepts ───────────────

const MATERIAL_WORDS = ['wood', 'metal', 'acrylic', 'glass', 'mirror', 'crystal', 'velvet', 'silk', 'fabric', 'brass', 'cane', 'rattan', 'ceramic']

function contextFor(input: EngineInput, slots: Slot[], variant: 0 | 1 | 2): Context {
  const a = input.answers
  const answerMoods = moodsFromAnswers(a)
  const answerStyles = stylesFromAnswers(a)
  const moods = [input.controls.mood, ...answerMoods.filter((m) => m !== input.controls.mood)]
  const styles = [input.controls.style, ...answerStyles.filter((s) => s !== input.controls.style)]
  // Variant B leads with the client's second mood, C with their second style — still on-brief.
  if (variant === 1 && moods.length > 1) moods.splice(0, 2, moods[1], moods[0])
  if (variant === 2 && styles.length > 1) styles.splice(0, 2, styles[1], styles[0])

  const palette = [...input.controls.palette]
  for (let i = 0; i < variant && palette.length > 1; i++) palette.push(palette.shift()!)

  const materialText = [...strings(a.q26_entrance_materials), ...strings(a.q97_structure_material), String(a.q94_fabric_type ?? '')]
    .join(' ')
    .toLowerCase()
  const materials = MATERIAL_WORDS.filter((m) => materialText.includes(m))
  const metallicAnswer = String(a.q21_metallic ?? '').toLowerCase()

  return {
    moods,
    styles,
    palette,
    materials,
    metallic: metallicAnswer && metallicAnswer !== 'none' ? metallicAnswer : null,
    density: input.controls.density,
    venue: input.controls.venue,
    eventType: input.event.type,
    budgetPerSlot: input.event.budgetPkr ? input.event.budgetPkr / Math.max(1, slots.length) : null,
    guests: input.event.guests ?? 100,
  }
}

export function generateConcepts(input: EngineInput): ConceptDraft[] {
  const answers = visibleAnswers(input.answers)
  const slots = buildSlots(answers)
  const pool = input.inventory.filter((i) => !excludedBy(i, answers, input.event.type))
  const band = tieBand(answers)
  const labels = ['A', 'B', 'C'].slice(0, input.variants)
  const usedInA = new Set<string>()
  // A pin survives only while it still passes the hard filters (answers may have changed since it was pinned).
  const byId = new Map(input.inventory.map((i) => [i.id, i]))
  const pins = (input.lockedTiles ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .filter((t) => {
      if (!t.itemId) return true
      const item = byId.get(t.itemId)
      return Boolean(item) && !excludedBy(item!, answers, input.event.type)
    })

  return labels.map((variantLabel, v) => {
    const ctx = contextFor({ ...input, answers }, slots, v as 0 | 1 | 2)
    const random = rng(`${input.seed}:${variantLabel}`)
    const used = new Set<string>()
    const perCategory = new Map<string, number>()
    const tiles: TileDraft[] = []

    const unplaced = [...pins]
    const keep = (pin: (typeof pins)[number], position: number, area: string) => {
      tiles.push({ position, area: pin.area ?? area, itemId: pin.itemId, imageUrl: pin.imageUrl, score: null, reasons: ['kept: you locked this piece'], locked: true })
      if (pin.itemId) used.add(pin.itemId)
      unplaced.splice(unplaced.indexOf(pin), 1)
    }

    slots.forEach((slot, position) => {
      const pinned = unplaced.find((p) => p.area === slot.area)
      if (pinned) return keep(pinned, position, slot.area)
      const scored = pool
        .filter((i) => slot.categories.includes(i.category) && !used.has(i.id) && (perCategory.get(i.category) ?? 0) < 3)
        .map((i) => {
          const s = scoreItem(i, slot, ctx)
          if (v > 0 && usedInA.has(i.id)) s.score += WEIGHTS.reuse
          return { item: i, ...s }
        })
        .sort((x, y) => y.score - x.score || x.item.id.localeCompare(y.item.id))
      if (scored.length === 0) return

      const top = scored[0].score
      const near = scored.filter((s) => s.score >= top - Math.abs(top) * band)
      const pick = near[Math.floor(random() * near.length)]
      used.add(pick.item.id)
      perCategory.set(pick.item.category, (perCategory.get(pick.item.category) ?? 0) + 1)
      if (v === 0) usedInA.add(pick.item.id)
      tiles.push({ position, area: slot.area, itemId: pick.item.id, imageUrl: pick.item.imageUrl, score: pick.score, reasons: pick.reasons, locked: false })
    })
    // Pins whose area no longer has a slot are still kept — never silently dropped.
    for (const pin of [...unplaced]) keep(pin, tiles.length, pin.area ?? 'feature')

    const lead = ctx.palette[0]
    const base = input.event.concept?.trim() || `${MOOD_LABELS[ctx.moods[0]]} ${input.event.type}`
    return {
      variantLabel,
      title: v === 0 ? base : `${base} — ${colourName(lead)}`,
      palette: ctx.palette,
      tiles: tiles.map((t, i) => ({ ...t, position: i })),
    }
  })
}

/** Next-best candidates for one tile's slot ("Ask for swap"). */
export function alternativesFor(input: EngineInput, tile: { area: string; itemId: string | null }, take = 5) {
  const answers = visibleAnswers(input.answers)
  const current = input.inventory.find((i) => i.id === tile.itemId)
  const categories: InventoryCategory[] = current ? [current.category] : ['Prop']
  const slot: Slot = { area: tile.area, categories }
  const ctx = contextFor({ ...input, answers }, buildSlots(answers), 0)
  return input.inventory
    .filter((i) => i.id !== tile.itemId && categories.includes(i.category) && !excludedBy(i, answers, input.event.type))
    .map((i) => ({ item: i, ...scoreItem(i, slot, ctx) }))
    .sort((x, y) => y.score - x.score || x.item.id.localeCompare(y.item.id))
    .slice(0, take)
}

