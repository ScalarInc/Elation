import { arAssetSchema, arSessionRequestBody, arSetSchema, eventArResponse } from '@elation/shared/api'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { rateLimit } from '../../lib/rate-limit'
import { currentUser } from '../../plugins/auth'
import * as ar from './service'

const params = z.object({ id: z.string() })

/** AR sets (docs/step-09-inspirations-ar.md). */
export const arRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.requireAuth)
  const deps = { db: app.prisma, mailer: app.mailer, appUrl: app.config.APP_URL, log: app.log }

  app.get('/ar-sets', { schema: { response: { 200: z.array(arSetSchema) } } }, async (request) =>
    ar.listArSets(app.prisma, currentUser(request)),
  )

  app.get('/events/:id/ar', { schema: { params, response: { 200: eventArResponse } } }, async (request) =>
    ar.getEventAr(app.prisma, currentUser(request), request.params.id),
  )

  app.get('/ar-sets/:id/assets', { schema: { params, response: { 200: z.array(arAssetSchema) } } }, async (request) =>
    ar.listArAssets(app.prisma, currentUser(request), request.params.id),
  )

  app.post(
    '/events/:id/ar/session-request',
    {
      schema: { params, body: arSessionRequestBody, response: { 202: z.object({ consultantName: z.string().nullable() }) } },
      // Each request emails the consultant.
      preHandler: [rateLimit({ name: 'ar-session', max: 5, windowMs: 60 * 60 * 1000, key: (r) => currentUser(r).id })],
    },
    async (request, reply) => reply.code(202).send(await ar.requestSession(deps, currentUser(request), request.params.id, request.body)),
  )

  app.post('/ar-sets/:id/notify-me', { schema: { params } }, async (request, reply) => {
    await ar.requestNotify(app.prisma, currentUser(request), request.params.id)
    return reply.code(204).send()
  })
}
