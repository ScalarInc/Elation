import type { FastifyInstance, FastifyRequest, onRequestAsyncHookHandler } from 'fastify'
import fp from 'fastify-plugin'
import type { Config } from '../config'
import type { Role, User } from '../generated/prisma/client'
import { sha256 } from '../lib/crypto'
import { AppError } from '../lib/errors'
import { ACCESS_MESSAGES, accessProblem, type AccessProblem } from '../modules/auth/access'
import {
  SESSION_COOKIE,
  SESSION_REFRESH_AFTER_MS,
  clearSessionCookie,
  deleteUserSessions,
  sessionTtlMs,
} from '../modules/auth/sessions'

export type AuthUser = User

declare module 'fastify' {
  interface FastifyRequest {
    /** Signed-in user + session, or null. Set for every request by the auth plugin. */
    auth: { user: AuthUser; sessionId: string } | null
    /** Why a session cookie was rejected (access ended), if it was. */
    authProblem: AccessProblem
  }
  interface FastifyInstance {
    requireAuth: onRequestAsyncHookHandler
    requireRole: (...roles: Role[]) => onRequestAsyncHookHandler
  }
}

/** Throws unless the request is signed in; narrows `request.auth`. */
export function currentUser(request: FastifyRequest): AuthUser {
  if (!request.auth) throw new AppError('UNAUTHENTICATED', 401, 'Please sign in')
  return request.auth.user
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export default fp<{ config: Config }>(async function authPlugin(app: FastifyInstance, { config }) {
  app.decorateRequest('auth', null)
  app.decorateRequest('authProblem', null)

  // CSRF: the session cookie is SameSite=Lax, and state-changing API calls
  // must come from our own origin when the browser says where they came from.
  app.addHook('onRequest', async (request) => {
    if (SAFE_METHODS.has(request.method) || !request.url.startsWith('/api/')) return
    const origin = request.headers.origin
    if (!origin) return
    const self = `${request.protocol}://${request.host}`
    if (origin !== config.WEB_ORIGIN && origin !== config.APP_URL && origin !== self) {
      throw new AppError('BAD_ORIGIN', 403, 'Request origin not allowed')
    }
  })

  app.addHook('onRequest', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE]
    if (!token) return

    const session = await app.prisma.session.findUnique({
      where: { id: sha256(token) },
      include: { user: true },
    })
    const now = new Date()
    if (!session || session.expiresAt <= now || session.user.deletedAt) {
      if (session) await app.prisma.session.delete({ where: { id: session.id } }).catch(() => {})
      clearSessionCookie(reply, config)
      return
    }

    const problem = accessProblem(session.user, now)
    if (problem) {
      // Access ended while signed in: end every session of this user, now.
      if (problem === 'ACCESS_EXPIRED' && session.user.status === 'ACTIVE') {
        await app.prisma.user.update({ where: { id: session.user.id }, data: { status: 'EXPIRED' } })
      }
      await deleteUserSessions(app.prisma, session.user.id)
      clearSessionCookie(reply, config)
      request.authProblem = problem
      return
    }

    request.auth = { user: session.user, sessionId: session.id }

    // Sliding expiry, throttled to one write per hour per session.
    if (now.getTime() - session.lastSeenAt.getTime() > SESSION_REFRESH_AFTER_MS) {
      await app.prisma.$transaction([
        app.prisma.session.update({
          where: { id: session.id },
          data: {
            lastSeenAt: now,
            expiresAt: new Date(now.getTime() + sessionTtlMs(config, session.persistent)),
          },
        }),
        app.prisma.user.update({ where: { id: session.user.id }, data: { lastActiveAt: now } }),
      ])
    }
  })

  const requireAuth: onRequestAsyncHookHandler = async (request) => {
    if (request.auth) return
    if (request.authProblem) {
      throw new AppError(request.authProblem, 403, ACCESS_MESSAGES[request.authProblem])
    }
    throw new AppError('UNAUTHENTICATED', 401, 'Please sign in')
  }
  app.decorate('requireAuth', requireAuth)

  app.decorate('requireRole', (...roles: Role[]): onRequestAsyncHookHandler => {
    return async function (request, reply) {
      await requireAuth.call(this, request, reply)
      if (!roles.includes(request.auth!.user.role)) {
        throw new AppError('FORBIDDEN', 403, 'You do not have access to this')
      }
    }
  })
})
