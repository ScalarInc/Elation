import {
  acceptInviteBody,
  forgotPasswordBody,
  inviteLookupResponse,
  loginBody,
  meSchema,
  resetPasswordBody,
} from '@elation/shared/api'
import type { FastifyRequest } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { byBodyEmail, byIp, rateLimit } from '../../lib/rate-limit'
import { loadMe } from '../me/dto'
import * as auth from './service'
import { clearSessionCookie, setSessionCookie } from './sessions'

const FIFTEEN_MIN = 15 * 60 * 1000

const meta = (request: FastifyRequest) => ({
  userAgent: request.headers['user-agent'],
  ip: request.ip,
})

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  const deps = { db: app.prisma, config: app.config, mailer: app.mailer }

  // Throttles: per IP (spraying many accounts) and per email (guessing one account).
  const perIp = (name: string, max: number) => rateLimit({ name: `${name}:ip`, max, windowMs: FIFTEEN_MIN, key: byIp })
  const perEmail = (name: string, max: number) =>
    rateLimit({ name: `${name}:email`, max, windowMs: FIFTEEN_MIN, key: byBodyEmail })

  app.post(
    '/auth/login',
    {
      schema: { body: loginBody, response: { 200: meSchema } },
      preHandler: [perIp('login', app.config.LOGIN_MAX_PER_IP), perEmail('login', app.config.LOGIN_MAX_PER_EMAIL)],
    },
    async (request, reply) => {
      const { userId, token } = await auth.login(deps, request.body, meta(request))
      setSessionCookie(reply, app.config, token, request.body.remember)
      return loadMe(app.prisma, userId)
    },
  )

  app.post('/auth/logout', async (request, reply) => {
    if (request.auth) await auth.logout(deps, request.auth.sessionId)
    clearSessionCookie(reply, app.config)
    return reply.code(204).send()
  })

  app.get(
    '/auth/invite/:code',
    {
      schema: { params: z.object({ code: z.string().max(100) }), response: { 200: inviteLookupResponse } },
      preHandler: [perIp('invite-lookup', 30)],
    },
    async (request) => auth.lookupInvite(deps, request.params.code),
  )

  app.post(
    '/auth/invite/accept',
    { schema: { body: acceptInviteBody, response: { 200: meSchema } }, preHandler: [perIp('invite-accept', 10)] },
    async (request, reply) => {
      const { userId, token } = await auth.acceptInvite(deps, request.body, meta(request))
      setSessionCookie(reply, app.config, token, true)
      return loadMe(app.prisma, userId)
    },
  )

  app.post(
    '/auth/password/forgot',
    { schema: { body: forgotPasswordBody }, preHandler: [perIp('forgot', 10), perEmail('forgot', 3)] },
    async (request, reply) => {
      await auth.requestPasswordReset(deps, request.body.email)
      return reply.code(204).send()
    },
  )

  app.post(
    '/auth/password/reset',
    { schema: { body: resetPasswordBody }, preHandler: [perIp('reset', 10)] },
    async (request, reply) => {
      await auth.resetPassword(deps, request.body)
      clearSessionCookie(reply, app.config)
      return reply.code(204).send()
    },
  )
}
