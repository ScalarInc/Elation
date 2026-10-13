import {
  consultBody,
  generateMoodboardBody,
  generateMoodboardResponse,
  listMoodboardsQuery,
  moodboardDefaultsSchema,
  moodboardSchema,
  reorderTilesBody,
  tileAlternativeSchema,
  updateMoodboardBody,
  updateTileBody,
} from '@elation/shared/api'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { rateLimit } from '../../lib/rate-limit'
import { currentUser } from '../../plugins/auth'
import * as moodboards from './service'

const eventParams = z.object({ id: z.string() })
const boardParams = z.object({ id: z.string() })
const tileParams = z.object({ id: z.string(), tileId: z.string().uuid() })

/** Recently answered generate requests, so a double-click doesn't curate twice (per instance). */
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000
const idempotent = new Map<string, { at: number; result: Promise<unknown> }>()

/** Moodboards (docs/step-07-moodboard.md). */
export const moodboardRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.requireAuth)
  const user = (r: Parameters<typeof currentUser>[0]) => currentUser(r)

  app.get(
    '/moodboards',
    { schema: { querystring: listMoodboardsQuery, response: { 200: z.array(moodboardSchema) } } },
    async (request) => moodboards.listMoodboards(app.prisma, user(request), request.query),
  )

  app.get(
    '/events/:id/moodboards',
    {
      schema: {
        params: eventParams,
        querystring: z.object({ generationId: z.string().uuid().optional() }),
        response: { 200: z.array(moodboardSchema) },
      },
    },
    async (request) => moodboards.listEventMoodboards(app.prisma, user(request), request.params.id, request.query.generationId),
  )

  app.get(
    '/events/:id/moodboards/defaults',
    { schema: { params: eventParams, response: { 200: moodboardDefaultsSchema } } },
    async (request) => moodboards.getDefaults(app.prisma, user(request), request.params.id),
  )

  app.post(
    '/events/:id/moodboards/generate',
    {
      schema: { params: eventParams, body: generateMoodboardBody, response: { 201: generateMoodboardResponse } },
      // Curation is cheap today, but an LLM pass (v2) won't be: cap per event.
      preHandler: [rateLimit({ name: 'moodboard-generate', max: 20, windowMs: 60 * 60 * 1000, key: (r) => (r.params as { id: string }).id })],
    },
    async (request, reply) => {
      const key = request.headers['idempotency-key']
      const cacheKey = typeof key === 'string' && key ? `${user(request).id}:${request.params.id}:${key}` : null
      const now = Date.now()
      for (const [k, v] of idempotent) if (now - v.at > IDEMPOTENCY_TTL_MS) idempotent.delete(k)

      const existing = cacheKey ? idempotent.get(cacheKey) : undefined
      const result = existing?.result ?? moodboards.generateForEvent(app.prisma, user(request), request.params.id, request.body)
      if (cacheKey && !existing) idempotent.set(cacheKey, { at: now, result })
      try {
        return reply.code(201).send((await result) as Awaited<ReturnType<typeof moodboards.generateForEvent>>)
      } catch (err) {
        if (cacheKey) idempotent.delete(cacheKey)
        throw err
      }
    },
  )

  app.get('/moodboards/:id', { schema: { params: boardParams, response: { 200: moodboardSchema } } }, async (request) =>
    moodboards.getMoodboard(app.prisma, user(request), request.params.id),
  )

  app.patch(
    '/moodboards/:id',
    { schema: { params: boardParams, body: updateMoodboardBody, response: { 200: moodboardSchema } } },
    async (request) => moodboards.updateMoodboard(app.prisma, user(request), request.params.id, request.body),
  )

  app.post('/moodboards/:id/save', { schema: { params: boardParams, response: { 200: moodboardSchema } } }, async (request) =>
    moodboards.saveMoodboard(app.prisma, user(request), request.params.id),
  )

  app.post('/moodboards/:id/primary', { schema: { params: boardParams, response: { 200: moodboardSchema } } }, async (request) =>
    moodboards.setPrimary(app.prisma, user(request), request.params.id),
  )

  app.post(
    '/moodboards/:id/duplicate',
    { schema: { params: boardParams, response: { 201: moodboardSchema } } },
    async (request, reply) => reply.code(201).send(await moodboards.duplicateMoodboard(app.prisma, user(request), request.params.id)),
  )

  app.delete('/moodboards/:id', { schema: { params: boardParams } }, async (request, reply) => {
    await moodboards.archiveMoodboard(app.prisma, user(request), request.params.id)
    return reply.code(204).send()
  })

  app.put(
    '/moodboards/:id/tiles/order',
    { schema: { params: boardParams, body: reorderTilesBody, response: { 200: moodboardSchema } } },
    async (request) => moodboards.reorderTiles(app.prisma, user(request), request.params.id, request.body.tileIds),
  )

  app.patch(
    '/moodboards/:id/tiles/:tileId',
    { schema: { params: tileParams, body: updateTileBody, response: { 200: moodboardSchema } } },
    async (request) => moodboards.updateTile(app.prisma, user(request), request.params.id, request.params.tileId, request.body),
  )

  app.get(
    '/moodboards/:id/tiles/:tileId/alternatives',
    { schema: { params: tileParams, response: { 200: z.array(tileAlternativeSchema) } } },
    async (request) => moodboards.tileAlternatives(app.prisma, user(request), request.params.id, request.params.tileId),
  )

  app.post(
    '/moodboards/:id/tiles/:tileId/consult',
    {
      schema: { params: tileParams, body: consultBody },
      // Each request lands in the consultant's feed — keep a stuck button from flooding it.
      preHandler: [rateLimit({ name: 'moodboard-consult', max: 30, windowMs: 60 * 60 * 1000, key: (r) => currentUser(r).id })],
    },
    async (request, reply) => {
      await moodboards.consultOnTile(app.prisma, user(request), request.params.id, request.params.tileId, request.body.note)
      return reply.code(202).send()
    },
  )
}
