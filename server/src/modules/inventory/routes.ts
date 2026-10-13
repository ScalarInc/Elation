import {
  inventoryImportReport,
  inventoryItemSchema,
  inventoryWriteBody,
  listInventoryQuery,
} from '@elation/shared/api'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { currentUser } from '../../plugins/auth'
import * as inventory from './service'

const params = z.object({ id: z.string().uuid() })

/** Catalogue reads for every signed-in user (clients see active items only). */
export const inventoryRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.requireAuth)

  app.get(
    '/inventory',
    { schema: { querystring: listInventoryQuery, response: { 200: z.array(inventoryItemSchema), 304: z.null() } } },
    async (request, reply) => {
      // Small, read-heavy list: let the browser revalidate cheaply.
      const etag = await inventory.inventoryVersion(app.prisma, currentUser(request))
      if (request.headers['if-none-match'] === etag) return reply.code(304).send(null)
      reply.header('ETag', etag).header('Cache-Control', 'private, max-age=60')
      return inventory.listInventory(app.prisma, currentUser(request), request.query)
    },
  )

  app.get('/inventory/:id', { schema: { params, response: { 200: inventoryItemSchema } } }, async (request) =>
    inventory.getInventoryItem(app.prisma, currentUser(request), request.params.id),
  )
}

/** Catalogue management — admins only (docs/step-06-inventory.md). */
export const adminInventoryRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.requireRole('ADMIN'))

  // Spreadsheet uploads arrive as raw text/csv (≤ 2 MB).
  app.addContentTypeParser(['text/csv', 'text/plain'], { parseAs: 'string', bodyLimit: 2 * 1024 * 1024 }, (_req, body, done) =>
    done(null, body),
  )

  app.post(
    '/admin/inventory',
    { schema: { body: inventoryWriteBody, response: { 201: inventoryItemSchema } } },
    async (request, reply) =>
      reply.code(201).send(await inventory.createInventoryItem(app.prisma, currentUser(request), request.body)),
  )

  app.patch(
    '/admin/inventory/:id',
    { schema: { params, body: inventoryWriteBody, response: { 200: inventoryItemSchema } } },
    async (request) =>
      inventory.updateInventoryItem(app.prisma, currentUser(request), request.params.id, request.body),
  )

  app.post('/admin/inventory/:id/archive', { schema: { params, response: { 200: inventoryItemSchema } } }, async (request) =>
    inventory.setInventoryActive(app.prisma, currentUser(request), request.params.id, false),
  )

  app.post('/admin/inventory/:id/restore', { schema: { params, response: { 200: inventoryItemSchema } } }, async (request) =>
    inventory.setInventoryActive(app.prisma, currentUser(request), request.params.id, true),
  )

  app.post(
    '/admin/inventory/import',
    {
      schema: {
        querystring: z.object({ commit: z.enum(['true', 'false']).default('false') }),
        body: z.string().min(1),
        response: { 200: inventoryImportReport },
      },
    },
    async (request) =>
      inventory.importInventoryCsv(app.prisma, currentUser(request), request.body, {
        commit: request.query.commit === 'true',
      }),
  )

  app.get('/admin/inventory/export.csv', async (_request, reply) => {
    const csv = await inventory.exportInventoryCsv(app.prisma)
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="elation-inventory-${new Date().toISOString().slice(0, 10)}.csv"`)
      .send(csv)
  })
}
