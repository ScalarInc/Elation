import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import Fastify, { type FastifyServerOptions } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import type { Config } from './config'
import { healthRoutes } from './modules/health/routes'
import dbPlugin from './plugins/db'
import errorsPlugin, { errorBody } from './plugins/errors'
import webappPlugin from './plugins/webapp'

export const API_PREFIX = '/api/v1'

async function loggerOptions(config: Config): Promise<FastifyServerOptions['logger']> {
  if (config.NODE_ENV === 'test') return false
  // Human-readable logs in development; JSON everywhere else (Railway log drain).
  // pino-pretty is a devDependency, so it is only imported in development.
  const stream =
    config.NODE_ENV === 'development'
      ? (await import('pino-pretty')).default({ translateTime: 'HH:MM:ss', ignore: 'pid,hostname' })
      : undefined
  return {
    level: config.LOG_LEVEL,
    // Never log credentials or contact details (docs/step-14-deploy-ops.md).
    redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
    stream,
  }
}

export async function buildApp(config: Config) {
  const app = Fastify({
    logger: await loggerOptions(config),
    trustProxy: true, // Railway terminates TLS in front of us
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  await app.register(errorsPlugin)
  // CSP is configured in Step 14 once the webapp's asset origins are final.
  await app.register(helmet, { contentSecurityPolicy: false })
  await app.register(cookie)
  // Per-route limits (login, invite, messages) opt in from Step 3 onwards.
  await app.register(rateLimit, { global: false })
  await app.register(dbPlugin, { databaseUrl: config.DATABASE_URL })

  await app.register(
    async (api) => {
      await api.register(healthRoutes)
    },
    { prefix: API_PREFIX },
  )

  const servesWebapp = Boolean(config.SERVE_WEBAPP_DIST)
  if (config.SERVE_WEBAPP_DIST) {
    await app.register(webappPlugin, { root: config.SERVE_WEBAPP_DIST })
  }

  app.setNotFoundHandler((request, reply) => {
    const wantsPage =
      servesWebapp &&
      request.method === 'GET' &&
      !request.url.startsWith('/api/') &&
      request.headers.accept?.includes('text/html')
    if (wantsPage) {
      // SPA fallback: client-side routes like /events/123 survive a refresh.
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html')
    }
    return reply
      .code(404)
      .send(errorBody('ROUTE_NOT_FOUND', `No route for ${request.method} ${request.url}`))
  })

  return app
}

export type App = Awaited<ReturnType<typeof buildApp>>
