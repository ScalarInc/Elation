import type { FastifyRequest, preHandlerAsyncHookHandler } from 'fastify'
import { AppError } from './errors'

/**
 * Fixed-window rate limiter used as a route preHandler.
 *
 * Why not @fastify/rate-limit: it lets only ONE limiter run per request, so a
 * per-IP and a per-email limit can't be stacked on the login route.
 *
 * State is in memory — correct for the single Railway instance we launch with.
 * When the API scales out, back `hits` with Postgres or Redis (docs/00-decisions.md).
 */
export function rateLimit(opts: {
  /** Distinguishes limiters that share a key space (e.g. "login:ip"). */
  name: string
  max: number
  windowMs: number
  key: (request: FastifyRequest) => string
}): preHandlerAsyncHookHandler {
  const hits = new Map<string, { count: number; resetAt: number }>()
  let lastSweep = Date.now()

  return async (request, reply) => {
    const now = Date.now()
    if (now - lastSweep > opts.windowMs) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k)
      lastSweep = now
    }

    const key = `${opts.name}:${opts.key(request)}`
    let entry = hits.get(key)
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + opts.windowMs }
      hits.set(key, entry)
    }
    entry.count += 1

    if (entry.count > opts.max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
      reply.header('Retry-After', retryAfter)
      throw new AppError('RATE_LIMITED', 429, 'Too many attempts — please wait a few minutes and try again.', {
        retryAfterSeconds: retryAfter,
      })
    }
  }
}

export const byIp = (request: FastifyRequest) => request.ip
export const byBodyEmail = (request: FastifyRequest) =>
  String((request.body as { email?: unknown } | undefined)?.email ?? '').trim().toLowerCase()
