import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'

const healthResponse = z.object({ ok: z.literal(true) })
const readyResponse = z.object({
  ok: z.boolean(),
  checks: z.object({ database: z.enum(['up', 'down']) }),
})

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  // Process is up. Used by Railway's health check during deploys.
  app.get('/healthz', { schema: { response: { 200: healthResponse } } }, async () => ({
    ok: true as const,
  }))

  // Process can serve traffic: database reachable.
  app.get(
    '/readyz',
    { schema: { response: { 200: readyResponse, 503: readyResponse } } },
    async (request, reply) => {
      try {
        await app.prisma.$queryRaw`SELECT 1`
        return { ok: true, checks: { database: 'up' as const } }
      } catch (err) {
        request.log.warn({ err }, 'readiness check: database down')
        return reply.code(503).send({ ok: false, checks: { database: 'down' as const } })
      }
    },
  )
}
