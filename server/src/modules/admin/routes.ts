import { inviteClientBody, inviteClientResponse } from '@elation/shared/api'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { currentUser } from '../../plugins/auth'
import { inviteClient } from './invites'

/** Staff-only API. Step 3 ships client invitations; Step 12 adds the rest. */
export const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  // onRequest, not preHandler: reject callers before body validation runs.
  app.addHook('onRequest', app.requireRole('CONSULTANT', 'ADMIN'))

  app.post(
    '/admin/clients/invite',
    { schema: { body: inviteClientBody, response: { 201: inviteClientResponse } } },
    async (request, reply) => {
      const result = await inviteClient(
        { db: app.prisma, config: app.config, mailer: app.mailer },
        currentUser(request),
        request.body,
        { ip: request.ip },
      )
      return reply.code(201).send(result)
    },
  )
}
