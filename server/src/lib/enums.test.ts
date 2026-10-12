import { EVENT_TYPES, INVENTORY_CATEGORIES, INVENTORY_UNITS, VENUE_SETTINGS } from '@elation/shared/domain'
import { describe, expect, it } from 'vitest'
import {
  EventType,
  InventoryCategory,
  InventoryUnit,
  VenueSetting,
} from '../generated/prisma/enums'
import {
  eventTypeFromDb,
  eventTypeToDb,
  inventoryCategoryFromDb,
  inventoryCategoryToDb,
  inventoryUnitFromDb,
  inventoryUnitToDb,
  venueSettingFromDb,
  venueSettingToDb,
} from './enums'

// If someone adds a value on one side only, these fail.
describe('enum mapping stays in sync between @elation/shared and Prisma', () => {
  it('event types', () => {
    expect(EVENT_TYPES.map(eventTypeToDb).sort()).toEqual(Object.values(EventType).sort())
    for (const label of EVENT_TYPES) expect(eventTypeFromDb(eventTypeToDb(label))).toBe(label)
    expect(eventTypeToDb('Corporate Event')).toBe('CORPORATE_EVENT')
  })

  it('venue settings', () => {
    expect(VENUE_SETTINGS.map(venueSettingToDb).sort()).toEqual(Object.values(VenueSetting).sort())
    for (const label of VENUE_SETTINGS) expect(venueSettingFromDb(venueSettingToDb(label))).toBe(label)
  })

  it('inventory categories', () => {
    expect(INVENTORY_CATEGORIES.map(inventoryCategoryToDb).sort()).toEqual(
      Object.values(InventoryCategory).sort(),
    )
    for (const label of INVENTORY_CATEGORIES)
      expect(inventoryCategoryFromDb(inventoryCategoryToDb(label))).toBe(label)
  })

  it('inventory units', () => {
    expect(INVENTORY_UNITS.map(inventoryUnitToDb).sort()).toEqual(Object.values(InventoryUnit).sort())
    expect(inventoryUnitToDb('linear ft')).toBe('LINEAR_FT')
    for (const label of INVENTORY_UNITS) expect(inventoryUnitFromDb(inventoryUnitToDb(label))).toBe(label)
  })
})
