import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import Fastify, { type FastifyServerOptions } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import type { Config } from './config'
import { LogMailer, ResendMailer, type Mailer } from './lib/mailer'
import { adminRoutes } from './modules/admin/routes'
import { authRoutes } from './modules/auth/routes'
import { expireLapsedClients } from './modules/auth/sweep'
import { eventRoutes } from './modules/events/routes'
import { healthRoutes } from './modules/health/routes'
import { adminInventoryRoutes, inventoryRoutes } from './modules/inventory/routes'
import { meRoutes } from './modules/me/routes'
import { questionnaireRoutes } from './modules/questionnaire/routes'
import authPlugin from './plugins/auth'
import dbPlugin from './plugins/db'
import errorsPlugin, { errorBody } from './plugins/errors'
import webappPlugin from './plugins/webapp'

export const API_PREFIX = '/api/v1'

declare module 'fastify' {
  interface FastifyInstance {
    config: Config
    mailer: Mailer
  }
}

export type AppDeps = {
  /** Override the mailer (tests pass a MemoryMailer). */
  mailer?: Mailer
}

const SWEEP_INTERVAL_MS = 60 * 60 * 1000

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

export async function buildApp(config: Config, deps: AppDeps = {}) {
  const app = Fastify({
    logger: await loggerOptions(config),
    trustProxy: true, // Railway terminates TLS in front of us
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  app.decorate('config', config)
  app.decorate(
    'mailer',
    deps.mailer ??
      (config.RESEND_API_KEY ? new ResendMailer(config.RESEND_API_KEY, config.MAIL_FROM) : new LogMailer(app.log)),
  )

  await app.register(errorsPlugin)
  // CSP is configured in Step 14 once the webapp's asset origins are final.
  await app.register(helmet, { contentSecurityPolicy: false })
  await app.register(cookie)
  await app.register(dbPlugin, { databaseUrl: config.DATABASE_URL })
  await app.register(authPlugin, { config })

  await app.register(
    async (api) => {
      await api.register(healthRoutes)
      await api.register(authRoutes)
      await api.register(meRoutes)
      await api.register(eventRoutes)
      await api.register(questionnaireRoutes)
      await api.register(inventoryRoutes)
      await api.register(adminInventoryRoutes)
      await api.register(adminRoutes)
    },
    { prefix: API_PREFIX },
  )

  // Access-expiry sweep (docs/step-03-auth.md). Tests call expireLapsedClients directly.
  if (config.NODE_ENV !== 'test') {
    const sweep = () =>
      expireLapsedClients(app.prisma)
        .then((n) => n > 0 && app.log.info({ expired: n }, 'access sweep: clients expired'))
        .catch((err) => app.log.error({ err }, 'access sweep failed'))
    let timer: NodeJS.Timeout | undefined
    app.addHook('onReady', async () => {
      void sweep()
      timer = setInterval(sweep, SWEEP_INTERVAL_MS)
      timer.unref()
    })
    app.addHook('onClose', async () => clearInterval(timer))
  }

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
