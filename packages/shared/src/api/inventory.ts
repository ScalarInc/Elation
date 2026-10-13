import { z } from 'zod'
import { EVENT_TYPES, INVENTORY_CATEGORIES, INVENTORY_UNITS } from '../domain/enums'
import { INVENTORY_AREAS, MOODS, STYLES } from '../domain/vocab'

/** Inventory contracts (docs/step-06-inventory.md). */

export const inventoryItemSchema = z.object({
  id: z.string(),
  sku: z.string(),
  name: z.string(),
  category: z.enum(INVENTORY_CATEGORIES),
  colour: z.string(),
  colourHex: z.string().nullable(),
  material: z.string().nullable(),
  /** Rental price per unit; null = not priced yet ("price on request"). */
  pricePKR: z.number().int().nullable(),
  unit: z.enum(INVENTORY_UNITS),
  image: z.string().nullable(),
  /** Area tags (where the item is used). */
  tags: z.array(z.string()),
  moodTags: z.array(z.string()),
  styleTags: z.array(z.string()),
  eventTypes: z.array(z.enum(EVENT_TYPES)),
  active: z.boolean(),
  /** Staff only — omitted for clients. */
  stockQty: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
  updatedAt: z.string(),
})
export type InventoryItemDto = z.infer<typeof inventoryItemSchema>

export const listInventoryQuery = z.object({
  category: z.enum(INVENTORY_CATEGORIES).optional(),
  area: z.enum(INVENTORY_AREAS).optional(),
  q: z.string().trim().max(100).optional(),
  priced: z.enum(['true', 'false']).optional(),
  /** Staff only: include archived items. */
  includeArchived: z.enum(['true', 'false']).optional(),
})
export type ListInventoryQuery = z.input<typeof listInventoryQuery>

const tagList = <T extends readonly [string, ...string[]]>(values: T) => z.array(z.enum(values)).max(values.length)

export const inventoryWriteBody = z.object({
  sku: z.string().trim().min(1).max(40),
  name: z.string().trim().min(2).max(120),
  category: z.enum(INVENTORY_CATEGORIES),
  colour: z.string().trim().min(1).max(40),
  colourHex: z.string().regex(/^#[0-9a-f]{6}$/i).nullable().optional(),
  material: z.string().trim().max(80).nullable().optional(),
  pricePKR: z.number().int().min(0).max(100_000_000).nullable().optional(),
  unit: z.enum(INVENTORY_UNITS),
  stockQty: z.number().int().min(0).max(1_000_000).nullable().optional(),
  image: z.string().max(500).nullable().optional(),
  tags: tagList(INVENTORY_AREAS).min(1, 'Choose at least one area'),
  moodTags: tagList(MOODS).optional(),
  styleTags: tagList(STYLES).optional(),
  eventTypes: z.array(z.enum(EVENT_TYPES)).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
})
export type InventoryWriteBody = z.input<typeof inventoryWriteBody>

export const inventoryImportReport = z.object({
  committed: z.boolean(),
  created: z.number().int(),
  updated: z.number().int(),
  unchanged: z.number().int(),
  errors: z.array(z.object({ line: z.number().int(), sku: z.string().nullable(), messages: z.array(z.string()) })),
})
export type InventoryImportReport = z.infer<typeof inventoryImportReport>

/** CSV columns, in order (docs/assets/inventory-template.csv). */
export const INVENTORY_CSV_COLUMNS = [
  'sku',
  'name',
  'category',
  'colour',
  'colour_hex',
  'material',
  'price_pkr',
  'unit',
  'stock_qty',
  'areas',
  'moods',
  'styles',
  'event_types',
  'image_filename',
  'notes',
] as const
