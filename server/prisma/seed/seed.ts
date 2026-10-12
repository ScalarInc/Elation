/**
 * Loads the demo data the frontend was built against (snapshot of
 * webapp/src/mocks, taken 2026-10-12, in ./fixtures.json) into the database.
 *
 * Idempotent: every row gets a deterministic UUIDv7 (src/lib/ids.ts) and is
 * upserted, so running the seed twice changes nothing.
 *
 *   npm run db:seed -w server
 *
 * Demo logins (password for all: elation-dev):
 *   client      malaika.khan@example.com
 *   consultant  ayesha@elationbyfmh.com
 *   admin       admin@elationx.local
 */
import 'dotenv/config'
import {
  QUESTIONNAIRE_SCHEMA_VERSION,
  computeCategoryProgress,
  computeOverallPercent,
  type Answers,
  type EventType,
  type InventoryCategory,
  type InventoryUnit,
  type VenueSetting,
} from '@elation/shared'
import argon2 from 'argon2'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Prisma } from '../../src/generated/prisma/client'
import {
  eventTypeToDb,
  inventoryCategoryToDb,
  inventoryUnitToDb,
  venueSettingToDb,
} from '../../src/lib/enums'
import { SEED_EPOCH, seedId } from '../../src/lib/ids'
import { importInventoryCsv } from '../../src/modules/inventory/service'
import { createPrisma, type Db } from '../../src/plugins/db'

// ───────────── fixture shapes (as exported from webapp/src/mocks) ─────────────

type Fixtures = {
  currentUser: {
    id: string; name: string; email: string; phone?: string; accessExpiresAt: string
    city?: string; role?: string; partnerName?: string
    emergencyContactName?: string; emergencyContactPhone?: string
    notifications?: Record<string, boolean>
    consultant: { id: string; name: string; email: string }
  }
  events: {
    id: string; name: string; type: EventType; concept?: string; date: string
    venue: { name: string; city: string; indoor: VenueSetting }
    guests: number; budgetPKR: number; coverImage: string; status: 'draft' | 'active' | 'past'
    progress: { questionnaire: 'complete' | 'in_progress' | 'pending' }
  }[]
  moodboards: {
    id: string; eventId: string; title: string; cover: string; tiles: string[]
    palette: string[]; createdAt: string; liked: boolean
  }[]
  inventory: {
    id: string; name: string; category: InventoryCategory; colour: string; material?: string
    pricePKR: number; unit: InventoryUnit; image: string; tags: string[]
  }[]
  budgets: {
    eventId: string; budgetPKR: number
    lines: { id: string; category: string; itemId: string; qty: number; included: boolean }[]
  }[]
  inspirations: {
    id: string; slug: string; name: string; eventTypes: EventType[]; style: string
    palette: string[]; cover: string; tiles: string[]; summary: string
    featured?: boolean; budgetTier?: string
  }[]
  messages: {
    id: string; authorId: string; authorRole: 'client' | 'consultant' | 'system'
    body: string; createdAt: string; read?: boolean
  }[]
  threads: {
    id: string; title: string; lastMessageAt: string
    participants: { id: string; name: string; role: string }[]
  }[]
  arSets: {
    id: string; eventId?: string; eventType: EventType; title: string; theme: string
    status: 'ready' | 'rendering' | 'coming-soon'; progressPercent: number; eta?: string
    coverImage: string; floorPlan: string; aerialViews: string[]; summary: string; highlights: string[]
  }[]
  activity: {
    id: string; eventId?: string; kind: string; title: string; detail?: string; at: string
  }[]
  questionnaireSeeds: Record<string, { answers: Answers; elationDecides?: Record<string, boolean> }>
}

const fixtures: Fixtures = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures.json', import.meta.url)), 'utf8'),
)

export const DEMO_PASSWORD = 'elation-dev'

/** Fixture id → deterministic database id. */
const id = {
  user: (fixtureId: string) => seedId(`user:${fixtureId}`),
  event: (fixtureId: string) => seedId(`event:${fixtureId}`),
  item: (sku: string) => seedId(`inventory:${sku}`),
  moodboard: (fixtureId: string, at: string) => seedId(`moodboard:${fixtureId}`, at),
  tile: (moodboardId: string, i: number) => seedId(`tile:${moodboardId}:${i}`),
  plan: (eventId: string) => seedId(`budget:${eventId}`),
  line: (lineId: string) => seedId(`budget-line:${lineId}`),
  inspiration: (fixtureId: string) => seedId(`inspiration:${fixtureId}`),
  inspirationTile: (fixtureId: string, i: number) => seedId(`inspiration-tile:${fixtureId}:${i}`),
  arSet: (fixtureId: string) => seedId(`ar:${fixtureId}`),
  inspirationItem: (fixtureId: string, sku: string) => seedId(`inspiration-item:${fixtureId}:${sku}`),
  arAsset: (setId: string, sku: string) => seedId(`ar-asset:${setId}:${sku}`),
  thread: (fixtureId: string) => seedId(`thread:${fixtureId}`),
  message: (fixtureId: string, at: string) => seedId(`message:${fixtureId}`, at),
  activity: (fixtureId: string, at: string) => seedId(`activity:${fixtureId}`, at),
}

/** Fixture area tags → shared vocabulary (packages/shared/src/domain/vocab.ts). */
/**
 * What each showcase concept carries into a moodboard and budget when adopted
 * (docs/step-09-inspirations-ar.md). Placeholder pieces until Elation's real
 * catalogue is priced; quantities scale per 100 guests or are fixed.
 */
type InspirationPiece = [sku: string, category: string, rule: { per100?: number; fixed?: number }]
const INSPIRATION_ITEMS: Record<string, InspirationPiece[]> = {
  insp_noor: [
    ['i_backdrop_arch', 'Stage', { fixed: 1 }],
    ['i_sofa_blush', 'Stage', { fixed: 2 }],
    ['i_floral_blossom', 'Florals', { fixed: 40 }],
    ['i_floral_wild', 'Dining', { per100: 10 }],
    ['i_chand_crystal', 'Ceiling', { fixed: 2 }],
    ['i_light_candle', 'Lighting', { per100: 10 }],
    ['i_chair_gold', 'Seating', { per100: 100 }],
  ],
  insp_gilded: [
    ['i_backdrop_arch', 'Stage', { fixed: 1 }],
    ['i_sofa_ivory', 'Stage', { fixed: 2 }],
    ['i_chand_crystal', 'Ceiling', { fixed: 3 }],
    ['i_chair_gold', 'Seating', { per100: 100 }],
    ['i_table_round', 'Dining', { per100: 10 }],
    ['i_light_candle', 'Lighting', { per100: 10 }],
    ['i_signage_neon', 'Entrance', { fixed: 1 }],
  ],
  insp_garden: [
    ['i_floral_blossom', 'Florals', { fixed: 40 }],
    ['i_floral_wild', 'Dining', { per100: 10 }],
    ['i_chair_clear', 'Seating', { per100: 100 }],
    ['i_table_round', 'Dining', { per100: 10 }],
    ['i_light_lantern', 'Entrance', { fixed: 8 }],
    ['i_fabric_drape', 'Ceiling', { per100: 200 }],
  ],
  insp_crescent: [
    ['i_backdrop_moon', 'Stage', { fixed: 1 }],
    ['i_sofa_ivory', 'Stage', { fixed: 2 }],
    ['i_chair_cushion', 'Seating', { per100: 60 }],
    ['i_table_low', 'Dining', { per100: 10 }],
    ['i_light_candle', 'Lighting', { per100: 10 }],
  ],
  insp_ivory: [
    ['i_backdrop_arch', 'Stage', { fixed: 1 }],
    ['i_sofa_ivory', 'Stage', { fixed: 2 }],
    ['i_chair_clear', 'Seating', { per100: 100 }],
    ['i_table_round', 'Dining', { per100: 10 }],
    ['i_floral_wild', 'Dining', { per100: 10 }],
    ['i_chand_brass', 'Ceiling', { fixed: 2 }],
  ],
  insp_rosewood: [
    ['i_backdrop_moon', 'Stage', { fixed: 1 }],
    ['i_prop_swan', 'Stage', { fixed: 1 }],
    ['i_light_lantern', 'Entrance', { fixed: 12 }],
    ['i_chair_cushion', 'Seating', { per100: 50 }],
    ['i_table_low', 'Dining', { per100: 8 }],
    ['i_fabric_drape', 'Ceiling', { per100: 200 }],
  ],
}

/** Pieces each AR set was modelled from (thumbnails come from the inventory photo). */
const AR_ASSET_SKUS = ['i_backdrop_arch', 'i_floral_blossom', 'i_chand_crystal', 'i_sofa_ivory', 'i_chair_gold', 'i_prop_swan', 'i_signage_neon', 'i_light_candle']

/** Elation's showcase sets — what a client without their own set sees. */
const SHOWCASE_AR_SETS = [
  { key: 'showcase_baraat', eventType: 'Baraat', title: 'Gilded Evening · Showcase', theme: 'Gilded Evening', cover: '/media/img_04.jpg', aerial: ['/media/img_04.jpg', '/media/img_14.jpg'] },
  { key: 'showcase_walima', eventType: 'Walima', title: 'Ivory & Oud · Showcase', theme: 'Ivory & Oud', cover: '/media/img_16.jpg', aerial: ['/media/img_16.jpg', '/media/img_10.jpg'] },
  { key: 'showcase_mehndi', eventType: 'Mehndi', title: 'Whispers of Noor · Showcase', theme: 'Whispers of Noor', cover: '/media/img_18.jpg', aerial: ['/media/img_18.jpg', '/media/img_11.jpg'] },
] as const

const AREA_ALIASES: Record<string, string> = {
  nikkah: 'stage',
  ceremony: 'stage',
  pathway: 'walkway',
  drape: 'ceiling',
}

/** Curation tags for the 18 placeholder items, so the moodboard engine can score them. */
const PLACEHOLDER_CURATION: Record<string, { hex: string; moods: string[]; styles: string[]; stock: number }> = {
  i_sofa_ivory: { hex: '#F2EADB', moods: ['romantic', 'serene'], styles: ['modern-luxury'], stock: 6 },
  i_sofa_blush: { hex: '#E3BFB9', moods: ['romantic', 'whimsical'], styles: ['modern-luxury'], stock: 4 },
  i_chair_gold: { hex: '#C9A23F', moods: ['regal', 'romantic'], styles: ['traditional', 'modern-luxury'], stock: 600 },
  i_chair_clear: { hex: '#E6EEF2', moods: ['serene'], styles: ['modern-luxury', 'editorial'], stock: 500 },
  i_chair_cushion: { hex: '#E3BFB9', moods: ['bohemian', 'romantic'], styles: ['traditional'], stock: 200 },
  i_table_round: { hex: '#E1CBAD', moods: ['serene'], styles: ['traditional', 'modern-luxury'], stock: 60 },
  i_table_low: { hex: '#6B4A33', moods: ['bohemian'], styles: ['traditional'], stock: 30 },
  i_chand_crystal: { hex: '#E8EEF2', moods: ['regal', 'dramatic'], styles: ['modern-luxury'], stock: 6 },
  i_chand_brass: { hex: '#C9A23F', moods: ['regal'], styles: ['traditional', 'architectural'], stock: 8 },
  i_floral_blossom: { hex: '#E3BFB9', moods: ['romantic', 'whimsical'], styles: ['garden'], stock: 120 },
  i_floral_wild: { hex: '#9AB1AE', moods: ['bohemian', 'serene'], styles: ['garden'], stock: 60 },
  i_backdrop_arch: { hex: '#F2EADB', moods: ['regal', 'serene'], styles: ['architectural', 'editorial'], stock: 2 },
  i_backdrop_moon: { hex: '#C9A23F', moods: ['regal', 'dramatic'], styles: ['traditional'], stock: 1 },
  i_prop_swan: { hex: '#F7F6F2', moods: ['romantic', 'serene'], styles: ['editorial'], stock: 2 },
  i_light_candle: { hex: '#F2EADB', moods: ['romantic', 'serene'], styles: ['garden', 'modern-luxury'], stock: 40 },
  i_light_lantern: { hex: '#B5893B', moods: ['bohemian', 'romantic'], styles: ['traditional'], stock: 30 },
  i_fabric_drape: { hex: '#FAF3EF', moods: ['romantic', 'serene'], styles: ['modern-luxury'], stock: 400 },
  i_signage_neon: { hex: '#E3BFB9', moods: ['whimsical'], styles: ['editorial'], stock: 3 },
}

const ADMIN = { id: 'u_admin', name: 'Elation Admin', email: 'admin@elationx.local' }
const STUDIO = { id: 'c_studio', name: 'Elation Design Studio', email: 'studio@elationbyfmh.com' }

export async function seed(db: Db) {
  const { currentUser: client } = fixtures
  const passwordHash = await argon2.hash(DEMO_PASSWORD)

  // ─── Users ───
  const staff = [
    { ...ADMIN, role: 'ADMIN' as const },
    { ...client.consultant, role: 'CONSULTANT' as const },
    { ...STUDIO, role: 'CONSULTANT' as const },
  ]
  for (const s of staff) {
    const data = { email: s.email, name: s.name, role: s.role, status: 'ACTIVE' as const, passwordHash }
    await db.user.upsert({ where: { id: id.user(s.id) }, create: { id: id.user(s.id), ...data }, update: data })
  }

  const clientId = id.user(client.id)
  const clientData = {
    email: client.email,
    name: client.name,
    phone: client.phone,
    role: 'CLIENT' as const,
    status: 'ACTIVE' as const,
    passwordHash,
    accessExpiresAt: new Date(client.accessExpiresAt),
    consultantId: id.user(client.consultant.id),
    city: client.city,
    clientRole: client.role,
    partnerName: client.partnerName,
    emergencyContactName: client.emergencyContactName,
    emergencyContactPhone: client.emergencyContactPhone,
    notificationPrefs: client.notifications,
  }
  await db.user.upsert({ where: { id: clientId }, create: { id: clientId, ...clientData }, update: clientData })

  // ─── Inventory ───
  // 1) Priced placeholders the demo budgets use (owner answer A3), tagged for curation.
  const priceBySku = new Map<string, number>()
  for (const item of fixtures.inventory) {
    priceBySku.set(item.id, item.pricePKR)
    const curation = PLACEHOLDER_CURATION[item.id]
    const data = {
      sku: item.id,
      name: item.name,
      category: inventoryCategoryToDb(item.category),
      colour: item.colour,
      colourHex: curation.hex,
      material: item.material,
      pricePkr: item.pricePKR,
      unit: inventoryUnitToDb(item.unit),
      imageUrl: item.image,
      // Area tags normalised to the shared vocabulary.
      tags: item.tags.map((t) => AREA_ALIASES[t] ?? t).filter((t, i, all) => all.indexOf(t) === i),
      moodTags: curation.moods,
      styleTags: curation.styles,
      stockQty: curation.stock,
      notes: 'placeholder',
    }
    await db.inventoryItem.upsert({ where: { id: id.item(item.id) }, create: { id: id.item(item.id), ...data }, update: data })
  }

  // 2) Elation's real catalogue, transcribed from the scanned photo sheets in
  //    Inventory/ (draft: prices to be confirmed by Elation — docs/step-06-inventory.md).
  const draft = readFileSync(fileURLToPath(new URL('./inventory-draft.csv', import.meta.url)), 'utf8')
  const report = await importInventoryCsv(db, null, draft, { commit: true })
  if (report.errors.length) throw new Error(`inventory-draft.csv has errors: ${JSON.stringify(report.errors)}`)

  // ─── Events + questionnaires ───
  for (const e of fixtures.events) {
    const eventId = id.event(e.id)
    const data = {
      clientId,
      name: e.name,
      concept: e.concept,
      type: eventTypeToDb(e.type),
      date: new Date(e.date.slice(0, 10)),
      venueName: e.venue.name,
      venueCity: e.venue.city,
      venueSetting: venueSettingToDb(e.venue.indoor),
      guests: e.guests,
      budgetPkr: e.budgetPKR,
      coverUrl: e.coverImage,
      // "past" is derived from the date (decision P6); only drafts are stored as such.
      status: e.status === 'draft' ? ('DRAFT' as const) : ('ACTIVE' as const),
    }
    await db.event.upsert({ where: { id: eventId }, create: { id: eventId, ...data }, update: data })

    const q = fixtures.questionnaireSeeds[e.id]
    if (q) {
      const decides = q.elationDecides ?? {}
      const percentComplete = computeOverallPercent(computeCategoryProgress(q.answers, decides))
      const qData = {
        schemaVersion: QUESTIONNAIRE_SCHEMA_VERSION,
        answers: q.answers as Prisma.InputJsonValue,
        elationDecides: decides,
        percentComplete,
        // The demo story has these clients finished with the questionnaire.
        submittedAt: e.progress.questionnaire === 'complete' ? new Date(SEED_EPOCH) : null,
      }
      await db.questionnaireResponse.upsert({
        where: { eventId },
        create: { eventId, ...qData },
        update: qData,
      })
    }
  }

  // ─── Moodboards (saved concepts) ───
  for (const m of fixtures.moodboards) {
    const moodboardId = id.moodboard(m.id, m.createdAt)
    const data = {
      eventId: id.event(m.eventId),
      generationId: seedId(`generation:${m.id}`, m.createdAt),
      variantLabel: 'A',
      title: m.title,
      status: 'SAVED' as const,
      isPrimary: true,
      liked: m.liked,
      palette: m.palette,
      controls: {},
      generator: 'fixture',
      coverTileId: id.tile(m.id, 0),
      createdAt: new Date(m.createdAt),
    }
    await db.moodboard.upsert({ where: { id: moodboardId }, create: { id: moodboardId, ...data }, update: data })

    for (const [i, imageUrl] of m.tiles.entries()) {
      // Same tile → inventory mapping the mock UI uses (MoodboardViewer tileItem).
      const sku = fixtures.inventory[i % fixtures.inventory.length].id
      const tileId = id.tile(m.id, i)
      const tile = {
        moodboardId,
        position: i,
        kind: 'INVENTORY' as const,
        inventoryItemId: id.item(sku),
        imageUrl,
        reasons: ['seeded from demo fixtures'],
      }
      await db.moodboardTile.upsert({ where: { id: tileId }, create: { id: tileId, ...tile }, update: tile })
    }
  }

  // ─── Budget plans ───
  for (const b of fixtures.budgets) {
    const planId = id.plan(b.eventId)
    const data = { eventId: id.event(b.eventId), targetPkr: b.budgetPKR, seededFrom: 'fixture' }
    await db.budgetPlan.upsert({ where: { id: planId }, create: { id: planId, ...data }, update: data })

    for (const [position, l] of b.lines.entries()) {
      const lineId = id.line(l.id)
      const line = {
        planId,
        category: l.category,
        inventoryItemId: id.item(l.itemId),
        qty: l.qty,
        unitPricePkr: priceBySku.get(l.itemId) ?? 0,
        included: l.included,
        position,
        source: 'seed',
      }
      await db.budgetLine.upsert({ where: { id: lineId }, create: { id: lineId, ...line }, update: line })
    }
  }

  // ─── Inspirations ───
  for (const insp of fixtures.inspirations) {
    const inspirationId = id.inspiration(insp.id)
    const data = {
      slug: insp.slug,
      name: insp.name,
      eventTypes: insp.eventTypes.map(eventTypeToDb),
      style: insp.style,
      palette: insp.palette,
      coverUrl: insp.cover,
      summary: insp.summary,
      featured: insp.featured ?? false,
      budgetTier: insp.budgetTier,
    }
    await db.inspiration.upsert({ where: { id: inspirationId }, create: { id: inspirationId, ...data }, update: data })
    for (const [position, imageUrl] of insp.tiles.entries()) {
      const tileId = id.inspirationTile(insp.id, position)
      const tile = { inspirationId, position, imageUrl }
      await db.inspirationTile.upsert({ where: { id: tileId }, create: { id: tileId, ...tile }, update: tile })
    }
    for (const [sku, category, rule] of INSPIRATION_ITEMS[insp.id] ?? []) {
      const itemId = id.inspirationItem(insp.id, sku)
      const row = { inspirationId, inventoryItemId: id.item(sku), category, qtyPer100Guests: rule.per100 ?? null, qtyFixed: rule.fixed ?? null }
      await db.inspirationItem.upsert({ where: { id: itemId }, create: { id: itemId, ...row }, update: row })
    }
  }

  // ─── AR sets ───
  const arStatus = { ready: 'READY', rendering: 'RENDERING', 'coming-soon': 'COMING_SOON' } as const
  for (const s of fixtures.arSets) {
    const setId = id.arSet(s.id)
    const data = {
      eventId: s.eventId ? id.event(s.eventId) : null,
      eventType: eventTypeToDb(s.eventType),
      title: s.title,
      theme: s.theme,
      status: arStatus[s.status],
      progressPercent: s.progressPercent,
      eta: s.eta ? new Date(s.eta) : null,
      coverUrl: s.coverImage,
      floorPlanUrl: s.floorPlan,
      aerialUrls: s.aerialViews,
      summary: s.summary,
      highlights: s.highlights,
    }
    await db.aRSet.upsert({ where: { id: setId }, create: { id: setId, ...data }, update: data })
  }
  for (const s of SHOWCASE_AR_SETS) {
    const setId = id.arSet(s.key)
    const data = {
      eventId: null,
      eventType: eventTypeToDb(s.eventType),
      title: s.title,
      theme: s.theme,
      status: 'READY' as const,
      progressPercent: 100,
      coverUrl: s.cover,
      floorPlanUrl: '/media/img_13.jpg',
      aerialUrls: [...s.aerial],
      summary: `Elation's ${s.theme} set — walk it on Meta Quest 3 to see how an AR preview of your own event will feel.`,
      highlights: ['Fully lit walk-through', 'True-to-scale décor', 'Passthrough over your real venue'],
    }
    await db.aRSet.upsert({ where: { id: setId }, create: { id: setId, ...data }, update: data })
  }
  const allSets = [...fixtures.arSets.map((s) => s.id), ...SHOWCASE_AR_SETS.map((s) => s.key)]
  for (const setKey of allSets) {
    for (const [i, sku] of AR_ASSET_SKUS.entries()) {
      const item = fixtures.inventory.find((x) => x.id === sku)!
      const assetId = id.arAsset(setKey, sku)
      const row = {
        setId: id.arSet(setKey),
        name: item.name,
        inventoryItemId: id.item(sku),
        thumbnailUrl: item.image,
        source: i % 2 === 0 ? 'Tripo AI' : 'Meshy AI',
      }
      await db.aRAsset.upsert({ where: { id: assetId }, create: { id: assetId, ...row }, update: row })
    }
  }

  // ─── Chat history ───
  // The mock has one flat message list; it belongs to the consultant thread.
  const consultantThreadFixtureId = 't_ayesha'
  const userIdFor = (fixtureUserId: string) => (fixtureUserId === client.id ? clientId : id.user(fixtureUserId))

  for (const t of fixtures.threads) {
    const threadId = id.thread(t.id)
    const data = { clientId, title: t.title, lastMessageAt: new Date(t.lastMessageAt) }
    await db.thread.upsert({ where: { id: threadId }, create: { id: threadId, ...data }, update: data })
  }

  const thread = id.thread(consultantThreadFixtureId)
  const messageIds: { id: string; read: boolean }[] = []
  for (const m of fixtures.messages) {
    const messageId = id.message(m.id, m.createdAt)
    const data = {
      threadId: thread,
      authorId: m.authorRole === 'system' ? null : userIdFor(m.authorId),
      kind: m.authorRole === 'system' ? ('SYSTEM' as const) : ('USER' as const),
      body: m.body,
      createdAt: new Date(m.createdAt),
    }
    await db.message.upsert({ where: { id: messageId }, create: { id: messageId, ...data }, update: data })
    messageIds.push({ id: messageId, read: m.read ?? true })
  }

  // Read receipts: the client has read up to the last message marked read;
  // staff have read everything.
  const lastReadByClient = messageIds.filter((m) => m.read).at(-1)?.id ?? null
  const lastMessage = messageIds.at(-1)?.id ?? null
  for (const t of fixtures.threads) {
    const threadId = id.thread(t.id)
    const isConsultantThread = t.id === consultantThreadFixtureId
    for (const p of t.participants) {
      const userId = userIdFor(p.id)
      const lastReadMessageId = isConsultantThread
        ? p.role === 'client' ? lastReadByClient : lastMessage
        : null
      const data = { lastReadMessageId, lastReadAt: lastReadMessageId ? new Date(t.lastMessageAt) : null }
      await db.threadParticipant.upsert({
        where: { threadId_userId: { threadId, userId } },
        create: { threadId, userId, ...data },
        update: data,
      })
    }
  }

  // ─── Activity ───
  for (const a of fixtures.activity) {
    const activityId = id.activity(a.id, a.at)
    const data = {
      clientId,
      eventId: a.eventId ? id.event(a.eventId) : null,
      kind: a.kind.toUpperCase() as 'MOODBOARD' | 'BUDGET' | 'NOTE' | 'SYSTEM' | 'AR',
      title: a.title,
      detail: a.detail,
      createdAt: new Date(a.at),
    }
    await db.activityEntry.upsert({ where: { id: activityId }, create: { id: activityId, ...data }, update: data })
  }
}

// ───────────── CLI entry ─────────────

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  if (process.env.NODE_ENV === 'production' && process.env.SEED_DEMO_DATA !== 'true') {
    console.error('Refusing to seed demo data in production (set SEED_DEMO_DATA=true to override).')
    process.exit(1)
  }
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  const db = createPrisma(url)
  try {
    await seed(db)
    console.log('Seeded demo data. Logins use password:', DEMO_PASSWORD)
  } finally {
    await db.$disconnect()
  }
}
