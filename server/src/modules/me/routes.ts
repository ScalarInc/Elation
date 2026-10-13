import {
  changePasswordBody,
  consentBody,
  meSchema,
  sessionSchema,
  updateNotificationsBody,
  updateProfileBody,
} from '@elation/shared/api'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { byIp, rateLimit } from '../../lib/rate-limit'
import { currentUser } from '../../plugins/auth'
import * as auth from '../auth/service'
import { deleteUserSessions } from '../auth/sessions'
import { loadMe } from './dto'
import * as me from './service'

/** The signed-in user's own account: profile, preferences, consent, security, data. */
export const meRoutes: FastifyPluginAsyncZod = async (app) => {
  // onRequest, not preHandler: reject signed-out callers before body validation runs.
  app.addHook('onRequest', app.requireAuth)

  app.get('/me', { schema: { response: { 200: meSchema } } }, async (request) =>
    loadMe(app.prisma, currentUser(request).id),
  )

  app.patch('/me', { schema: { body: updateProfileBody, response: { 200: meSchema } } }, async (request) => {
    const user = currentUser(request)
    await me.updateProfile(app.prisma, user.id, request.body)
    return loadMe(app.prisma, user.id)
  })

  app.patch(
    '/me/notifications',
    { schema: { body: updateNotificationsBody, response: { 200: meSchema } } },
    async (request) => {
      const user = currentUser(request)
      await me.updateNotifications(app.prisma, user.id, request.body)
      return loadMe(app.prisma, user.id)
    },
  )

  app.post('/me/consent', { schema: { body: consentBody, response: { 200: meSchema } } }, async (request) => {
    const user = currentUser(request)
    await me.recordConsent(app.prisma, user.id, request.body, request.ip)
    return loadMe(app.prisma, user.id)
  })

  app.get('/me/sessions', { schema: { response: { 200: z.array(sessionSchema) } } }, async (request) =>
    me.listSessions(app.prisma, currentUser(request).id, request.auth!.sessionId),
  )

  app.post('/auth/logout-others', async (request, reply) => {
    await deleteUserSessions(app.prisma, currentUser(request).id, request.auth!.sessionId)
    return reply.code(204).send()
  })

  app.post(
    '/auth/password/change',
    {
      schema: { body: changePasswordBody },
      preHandler: [rateLimit({ name: 'password-change', max: 10, windowMs: 15 * 60 * 1000, key: byIp })],
    },
    async (request, reply) => {
      await auth.changePassword(
        { db: app.prisma },
        { userId: currentUser(request).id, sessionId: request.auth!.sessionId, ...request.body },
      )
      return reply.code(204).send()
    },
  )

  app.get('/me/export', async (request, reply) => {
    const data = await me.exportData(app.prisma, currentUser(request).id)
    const stamp = new Date().toISOString().slice(0, 10)
    return reply
      .header('Content-Disposition', `attachment; filename="elation-x-data-${stamp}.json"`)
      .header('Cache-Control', 'no-store')
      .send(data)
  })

  app.post(
    '/me/deletion-request',
    { schema: { body: z.object({ reason: z.string().trim().max(1000).optional() }).optional() } },
    async (request, reply) => {
      await me.requestDeletion(app.prisma, currentUser(request).id, request.body?.reason, request.ip)
      return reply.code(202).send()
    },
  )
}
