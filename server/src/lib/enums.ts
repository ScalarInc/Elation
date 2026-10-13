import {
  EVENT_TYPES,
  INVENTORY_CATEGORIES,
  INVENTORY_UNITS,
  VENUE_SETTINGS,
  type EventType as EventTypeLabel,
  type InventoryCategory as InventoryCategoryLabel,
  type InventoryUnit as InventoryUnitLabel,
  type VenueSetting as VenueSettingLabel,
} from '@elation/shared/domain'
import type {
  EventType,
  InventoryCategory,
  InventoryUnit,
  VenueSetting,
} from '../generated/prisma/enums'

/**
 * The API speaks display labels ('Corporate Event', 'linear ft', 'Outdoor');
 * the database stores enum keys (CORPORATE_EVENT, LINEAR_FT, OUTDOOR).
 * Every conversion goes through these helpers so the two never drift.
 */
function toKey(label: string): string {
  return label.trim().toUpperCase().replace(/[\s-]+/g, '_')
}

function toLabel<T extends string>(key: string, labels: readonly T[]): T {
  const label = labels.find((l) => toKey(l) === key)
  if (!label) throw new Error(`Unknown enum key: ${key}`)
  return label
}

export const eventTypeToDb = (label: EventTypeLabel) => toKey(label) as EventType
export const eventTypeFromDb = (key: EventType) => toLabel(key, EVENT_TYPES)

export const venueSettingToDb = (label: VenueSettingLabel) => toKey(label) as VenueSetting
export const venueSettingFromDb = (key: VenueSetting) => toLabel(key, VENUE_SETTINGS)

export const inventoryCategoryToDb = (label: InventoryCategoryLabel) =>
  toKey(label) as InventoryCategory
export const inventoryCategoryFromDb = (key: InventoryCategory) =>
  toLabel(key, INVENTORY_CATEGORIES)

export const inventoryUnitToDb = (label: InventoryUnitLabel) => toKey(label) as InventoryUnit
export const inventoryUnitFromDb = (key: InventoryUnit) => toLabel(key, INVENTORY_UNITS)
