import { activityPageSchema, listActivityQuery } from '@elation/shared/api'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { currentUser } from '../../plugins/auth'
import { listActivity } from './service'

/** Activity feed (docs/step-10-chat-activity.md). */
export const activityRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.requireAuth)

  app.get('/activity', { schema: { querystring: listActivityQuery, response: { 200: activityPageSchema } } }, async (request) =>
    listActivity(app.prisma, currentUser(request), request.query),
  )
}
