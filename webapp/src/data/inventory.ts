import type { InventoryItemDto, ListInventoryQuery } from '@elation/shared/api'
import { useQuery } from '@tanstack/react-query'
import { API_MODE, apiFetch } from '@/lib/api/client'
import { inventory as fixtureInventory } from '@/mocks/fixtures'

/** Inventory catalogue (docs/step-06-inventory.md). */

function fromFixture(i: (typeof fixtureInventory)[number]): InventoryItemDto {
  return {
    id: i.id,
    sku: i.id,
    name: i.name,
    category: i.category,
    colour: i.colour,
    colourHex: null,
    material: i.material ?? null,
    pricePKR: i.pricePKR,
    unit: i.unit,
    image: i.image,
    tags: i.tags,
    moodTags: [],
    styleTags: [],
    eventTypes: [],
    active: true,
    updatedAt: new Date(0).toISOString(),
  }
}

export const inventoryApi = {
  list: (query: ListInventoryQuery = {}) => {
    if (API_MODE === 'mock') return Promise.resolve(fixtureInventory.map(fromFixture))
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v) as [string, string][])
    return apiFetch<InventoryItemDto[]>(`/inventory${qs.size ? `?${qs}` : ''}`)
  },
  get: (id: string) => apiFetch<InventoryItemDto>(`/inventory/${id}`),
}

/** The catalogue rarely changes during a session — cache it for a few minutes. */
export function useInventory(query: ListInventoryQuery = {}) {
  return useQuery({
    queryKey: ['inventory', query],
    queryFn: () => inventoryApi.list(query),
    staleTime: 5 * 60 * 1000,
  })
}

/** "PKR 45k" or "Price on request" for items Elation hasn't priced yet. */
export const isPriced = (item: Pick<InventoryItemDto, 'pricePKR'>): item is { pricePKR: number } =>
  item.pricePKR != null
