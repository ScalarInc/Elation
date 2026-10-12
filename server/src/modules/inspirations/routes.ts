import {
  adoptInspirationBody,
  adoptInspirationResponse,
  inspirationDetailSchema,
  inspirationSchema,
  listInspirationsQuery,
} from '@elation/shared/api'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { rateLimit } from '../../lib/rate-limit'
import { currentUser } from '../../plugins/auth'
import * as inspirations from './service'

const params = z.object({ slug: z.string().max(120) })

/** Inspiration gallery (docs/step-09-inspirations-ar.md). */
export const inspirationRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.requireAuth)

  app.get(
    '/inspirations',
    { schema: { querystring: listInspirationsQuery, response: { 200: z.array(inspirationSchema) } } },
    async (request) => inspirations.listInspirations(app.prisma, request.query),
  )

  app.get('/inspirations/:slug', { schema: { params, response: { 200: inspirationDetailSchema } } }, async (request) =>
    inspirations.getInspiration(app.prisma, currentUser(request), request.params.slug),
  )

  app.post(
    '/inspirations/:slug/adopt',
    {
      schema: { params, body: adoptInspirationBody, response: { 201: adoptInspirationResponse } },
      // Each adoption creates a lead moodboard and messages the consultant.
      preHandler: [rateLimit({ name: 'inspiration-adopt', max: 10, windowMs: 60 * 60 * 1000, key: (r) => currentUser(r).id })],
    },
    async (request, reply) =>
      reply.code(201).send(await inspirations.adoptInspiration(app.prisma, currentUser(request), request.params.slug, request.body)),
  )
}
