export const EVENT_TYPES = [
  'Mehndi',
  'Mayoun',
  'Baraat',
  'Walima',
  'Nikkah',
  'Engagement',
  'Birthday',
  'Corporate Event',
  'Milad',
  'Qawwali',
  'Dinner',
  'Bridal Shower',
  'Baby Shower',
  'Anniversary',
  'Other',
] as const
export type EventType = (typeof EVENT_TYPES)[number]

export const MODULE_STATUSES = ['complete', 'in_progress', 'pending'] as const
export type ModuleStatus = (typeof MODULE_STATUSES)[number]

export const VENUE_SETTINGS = ['Indoor', 'Outdoor', 'Both'] as const
export type VenueSetting = (typeof VENUE_SETTINGS)[number]

export const INVENTORY_CATEGORIES = [
  'Sofa',
  'Chair',
  'Table',
  'Chandelier',
  'Floral',
  'Backdrop',
  'Prop',
  'Signage',
  'Lighting',
  'Fabric',
] as const
export type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number]

export const INVENTORY_UNITS = ['each', 'set', 'linear ft', 'sqft'] as const
export type InventoryUnit = (typeof INVENTORY_UNITS)[number]

export const ROLES = ['client', 'consultant', 'admin'] as const
export type Role = (typeof ROLES)[number]
