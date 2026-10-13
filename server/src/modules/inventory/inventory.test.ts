import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp } from '../../test/app'
import { resetDb } from '../../test/db'
import { createUser, TEST_PASSWORD } from '../../test/users'
import { SESSION_COOKIE } from '../auth/sessions'

type TestApp = Awaited<ReturnType<typeof buildTestApp>>
let app: TestApp

beforeAll(async () => {
  app = await buildTestApp()
})
afterAll(async () => {
  await app.close()
})
beforeEach(async () => {
  await resetDb(app.prisma)
})

async function signIn(role: 'CLIENT' | 'CONSULTANT' | 'ADMIN') {
  const user = await createUser(app.prisma, { role })
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: user.email, password: TEST_PASSWORD } })
  return { [SESSION_COOKIE]: res.cookies.find((c) => c.name === SESSION_COOKIE)!.value }
}

const HEADER =
  'sku,name,category,colour,colour_hex,material,price_pkr,unit,stock_qty,areas,moods,styles,event_types,image_filename,notes\n'
const ROWS =
  'SOF-1,Ivory Curve Sofa,Sofa,Ivory,#F2EADB,Velvet,"45,000",each,6,stage; lounge,romantic; regal,Modern Luxury,,sofa.jpg,\n' +
  'FLR-1,Marigold Garlands,floral,Marigold,,Silk,,each,51,entrance; ceiling,bohemian,traditional,Mehndi; Mayoun,,Draft — needs price\n'

async function importCsv(cookies: Record<string, string>, csv: string, commit: boolean) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/admin/inventory/import?commit=${commit}`,
    cookies,
    headers: { 'content-type': 'text/csv' },
    payload: csv,
  })
}

describe('CSV import', () => {
  it('dry-runs, then commits, then reports a re-import as unchanged', async () => {
    const admin = await signIn('ADMIN')
    const dry = await importCsv(admin, HEADER + ROWS, false)
    expect(dry.statusCode).toBe(200)
    expect(dry.json()).toEqual({ committed: false, created: 2, updated: 0, unchanged: 0, errors: [] })
    expect(await app.prisma.inventoryItem.count()).toBe(0)

    const commit = await importCsv(admin, HEADER + ROWS, true)
    expect(commit.json()).toMatchObject({ committed: true, created: 2 })
    const sofa = await app.prisma.inventoryItem.findUniqueOrThrow({ where: { sku: 'SOF-1' } })
    expect(sofa).toMatchObject({
      pricePkr: 45_000, // "45,000" understood
      category: 'SOFA',
      tags: ['stage', 'lounge'],
      styleTags: ['modern-luxury'], // "Modern Luxury" normalised
      imageUrl: '/media/inventory/sofa.jpg',
    })
    const garland = await app.prisma.inventoryItem.findUniqueOrThrow({ where: { sku: 'FLR-1' } })
    expect(garland.pricePkr).toBeNull() // blank price = not priced yet
    expect(garland.eventTypes).toEqual(['MEHNDI', 'MAYOUN'])

    const again = await importCsv(admin, HEADER + ROWS, true)
    expect(again.json()).toMatchObject({ created: 0, updated: 0, unchanged: 2 })
  })

  it('reports row errors and applies nothing when any row is invalid', async () => {
    const admin = await signIn('ADMIN')
    const bad =
      HEADER +
      ROWS +
      'BAD-1,Thing,Spaceship,Red,,,100,each,1,stage,romantic,,,,\n' +
      'BAD-2,Other,Prop,Red,,,abc,each,1,kitchen,happy,,Rave,,\n' +
      'SOF-1,Dup,Sofa,Ivory,,,1,each,1,stage,,,,,\n'
    const res = await importCsv(admin, bad, true)
    const report = res.json()
    expect(report.committed).toBe(false)
    expect(report.errors.map((e: { line: number }) => e.line)).toEqual([4, 5, 6])
    expect(report.errors[0].messages[0]).toContain('Unknown category')
    expect(report.errors[1].messages.join(' ')).toMatch(/price_pkr|Rave/)
    expect(report.errors[2].messages[0]).toContain('Duplicate SKU')
    expect(await app.prisma.inventoryItem.count()).toBe(0)
  })

  it('exports a CSV that re-imports with no changes', async () => {
    const admin = await signIn('ADMIN')
    await importCsv(admin, HEADER + ROWS, true)
    const exported = await app.inject({ method: 'GET', url: '/api/v1/admin/inventory/export.csv', cookies: admin })
    expect(exported.headers['content-type']).toContain('text/csv')
    const again = await importCsv(admin, exported.body, true)
    expect(again.json()).toMatchObject({ created: 0, updated: 0, unchanged: 2 })
  })

  it('imports the real draft catalogue transcribed from the scans', async () => {
    const admin = await signIn('ADMIN')
    const csv = readFileSync(fileURLToPath(new URL('../../../prisma/seed/inventory-draft.csv', import.meta.url)), 'utf8')
    const res = await importCsv(admin, csv, false)
    expect(res.json().errors).toEqual([])
    expect(res.json().created).toBeGreaterThan(150)
  })
})

describe('reads + permissions', () => {
  async function seedTwo() {
    const admin = await signIn('ADMIN')
    await importCsv(admin, HEADER + ROWS, true)
    return admin
  }

  it('clients see active items without stock or internal notes; staff see everything', async () => {
    const admin = await seedTwo()
    const client = await signIn('CLIENT')

    const asClient = (await app.inject({ method: 'GET', url: '/api/v1/inventory', cookies: client })).json()
    expect(asClient).toHaveLength(2)
    expect(asClient[0]).not.toHaveProperty('stockQty')
    expect(asClient[0]).not.toHaveProperty('notes')

    const asAdmin = (await app.inject({ method: 'GET', url: '/api/v1/inventory', cookies: admin })).json()
    expect(asAdmin.find((i: { sku: string }) => i.sku === 'SOF-1').stockQty).toBe(6)
  })

  it('filters by area, category, priced and search text', async () => {
    await seedTwo()
    const client = await signIn('CLIENT')
    const get = async (qs: string) =>
      (await app.inject({ method: 'GET', url: `/api/v1/inventory?${qs}`, cookies: client })).json().map((i: { sku: string }) => i.sku)

    expect(await get('area=ceiling')).toEqual(['FLR-1'])
    expect(await get('category=Sofa')).toEqual(['SOF-1'])
    expect(await get('priced=true')).toEqual(['SOF-1'])
    expect(await get('q=marigold')).toEqual(['FLR-1'])
  })

  it('archived items disappear for clients but stay for admins', async () => {
    const admin = await seedTwo()
    const client = await signIn('CLIENT')
    const sofa = await app.prisma.inventoryItem.findUniqueOrThrow({ where: { sku: 'SOF-1' } })

    await app.inject({ method: 'POST', url: `/api/v1/admin/inventory/${sofa.id}/archive`, cookies: admin })
    expect((await app.inject({ method: 'GET', url: '/api/v1/inventory', cookies: client })).json()).toHaveLength(1)
    expect((await app.inject({ method: 'GET', url: `/api/v1/inventory/${sofa.id}`, cookies: client })).statusCode).toBe(404)
    expect((await app.inject({ method: 'GET', url: '/api/v1/inventory?includeArchived=true', cookies: admin })).json()).toHaveLength(2)
  })

  it('only admins can change the catalogue; price changes are audited', async () => {
    const admin = await seedTwo()
    const consultant = await signIn('CONSULTANT')
    const sofa = await app.prisma.inventoryItem.findUniqueOrThrow({ where: { sku: 'SOF-1' } })
    const body = {
      sku: 'SOF-1', name: 'Ivory Curve Sofa', category: 'Sofa', colour: 'Ivory', pricePKR: 48_000, unit: 'each', tags: ['stage'],
    }

    const denied = await app.inject({ method: 'PATCH', url: `/api/v1/admin/inventory/${sofa.id}`, cookies: consultant, payload: body })
    expect(denied.statusCode).toBe(403)

    const ok = await app.inject({ method: 'PATCH', url: `/api/v1/admin/inventory/${sofa.id}`, cookies: admin, payload: body })
    expect(ok.json().pricePKR).toBe(48_000)
    expect(await app.prisma.auditLog.count({ where: { action: 'inventory.price-change', targetId: sofa.id } })).toBe(1)

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/inventory',
      cookies: admin,
      payload: { ...body, sku: 'NEW-1', tags: [] },
    })
    expect(created.statusCode).toBe(400) // at least one area tag
  })

  it('supports conditional GETs on the list (ETag)', async () => {
    await seedTwo()
    const client = await signIn('CLIENT')
    const first = await app.inject({ method: 'GET', url: '/api/v1/inventory', cookies: client })
    const etag = first.headers.etag as string
    expect(etag).toBeTruthy()
    const second = await app.inject({ method: 'GET', url: '/api/v1/inventory', cookies: client, headers: { 'if-none-match': etag } })
    expect(second.statusCode).toBe(304)
  })
})
