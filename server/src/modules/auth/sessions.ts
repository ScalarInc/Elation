import type { FastifyReply } from 'fastify'
import type { Config } from '../../config'
import { randomToken, sha256 } from '../../lib/crypto'
import type { Db } from '../../plugins/db'

export const SESSION_COOKIE = 'elx_sid'

/** "Remember me" off: the cookie dies with the browser and the server side after 12 h of inactivity. */
const NON_PERSISTENT_TTL_MS = 12 * 60 * 60 * 1000
/** Sliding expiry is refreshed at most this often, so reads don't write on every request. */
export const SESSION_REFRESH_AFTER_MS = 60 * 60 * 1000

export function sessionTtlMs(config: Config, persistent: boolean) {
  return persistent ? config.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000 : NON_PERSISTENT_TTL_MS
}

export async function createSession(
  db: Db,
  config: Config,
  input: { userId: string; persistent: boolean; userAgent?: string; ip?: string },
) {
  const token = randomToken()
  const now = new Date()
  await db.session.create({
    data: {
      id: sha256(token),
      userId: input.userId,
      persistent: input.persistent,
      expiresAt: new Date(now.getTime() + sessionTtlMs(config, input.persistent)),
      userAgent: input.userAgent?.slice(0, 300),
      ip: input.ip,
    },
  })
  return token
}

export function setSessionCookie(reply: FastifyReply, config: Config, token: string, persistent: boolean) {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    domain: config.SESSION_COOKIE_DOMAIN,
    // No maxAge → browser-session cookie when "remember me" is off.
    maxAge: persistent ? Math.floor(sessionTtlMs(config, true) / 1000) : undefined,
  })
}

export function clearSessionCookie(reply: FastifyReply, config: Config) {
  reply.clearCookie(SESSION_COOKIE, { path: '/', domain: config.SESSION_COOKIE_DOMAIN })
}

/** End every session of a user (password reset, revoke, expiry). */
export async function deleteUserSessions(db: Db, userId: string, exceptSessionId?: string) {
  await db.session.deleteMany({
    where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
  })
}
