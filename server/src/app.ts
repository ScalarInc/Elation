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
import { createStorage, type Storage } from './lib/storage'
import { adminRoutes, publicInquiryRoutes } from './modules/admin/routes'
import { authRoutes } from './modules/auth/routes'
import { expireLapsedClients } from './modules/auth/sweep'
import { eventRoutes } from './modules/events/routes'
import { healthRoutes } from './modules/health/routes'
import { adminInventoryRoutes, inventoryRoutes } from './modules/inventory/routes'
import { meRoutes } from './modules/me/routes'
import { moodboardRoutes } from './modules/moodboards/routes'
import { budgetRoutes } from './modules/budget/routes'
import { inspirationRoutes } from './modules/inspirations/routes'
import { arRoutes } from './modules/ar/routes'
import { activityRoutes } from './modules/activity/routes'
import { chatRoutes } from './modules/chat/routes'
import { fileRoutes, localStorageRoutes } from './modules/files/routes'
import { sweepPendingUploads } from './modules/files/service'
import { sendUnreadDigests } from './modules/chat/digest'
import { questionnaireRoutes } from './modules/questionnaire/routes'
import authPlugin from './plugins/auth'
import dbPlugin from './plugins/db'
import errorsPlugin, { errorBody } from './plugins/errors'
import realtimePlugin from './plugins/realtime'
import webappPlugin from './plugins/webapp'

export const API_PREFIX = '/api/v1'

declare module 'fastify' {
  interface FastifyInstance {
    config: Config
    mailer: Mailer
    storage: Storage
  }
}

export type AppDeps = {
  /** Override the mailer (tests pass a MemoryMailer). */
  mailer?: Mailer
  /** Override file storage. */
  storage?: Storage
}

const SWEEP_INTERVAL_MS = 60 * 60 * 1000
const DIGEST_INTERVAL_MS = 60 * 1000

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
    serializers: {
      // Signed storage links carry their token in ?t= — never write it to the logs.
      req: (req: { method: string; url: string; hostname?: string; ip?: string }) => ({
        method: req.method,
        url: req.url.replace(/([?&]t=)[^&]+/, '$1[redacted]'),
        host: req.hostname,
        remoteAddress: req.ip,
      }),
    },
    stream,
  }
}

export async function buildApp(config: Config, deps: AppDeps = {}) {
  const app = Fastify({
    logger: await loggerOptions(config),
    // Railway's edge is the one proxy in front of us: trust exactly that hop, so a
    // caller can't pick their own IP with X-Forwarded-For (rate limits, audit).
    trustProxy: (_address: string, hop: number) => hop === 0,
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  app.decorate('config', config)
  app.decorate(
    'mailer',
    deps.mailer ??
      (config.RESEND_API_KEY ? new ResendMailer(config.RESEND_API_KEY, config.MAIL_FROM) : new LogMailer(app.log)),
  )

  app.decorate('storage', deps.storage ?? createStorage(config))

  await app.register(errorsPlugin)
  // CSP is configured in Step 14 once the webapp's asset origins are final.
  await app.register(helmet, { contentSecurityPolicy: false })
  await app.register(cookie)
  await app.register(dbPlugin, { databaseUrl: config.DATABASE_URL })
  await app.register(authPlugin, { config })
  await app.register(realtimePlugin, { databaseUrl: config.DATABASE_LISTEN_URL ?? config.DATABASE_URL })

  await app.register(
    async (api) => {
      await api.register(healthRoutes)
      await api.register(authRoutes)
      await api.register(meRoutes)
      await api.register(eventRoutes)
      await api.register(questionnaireRoutes)
      await api.register(inventoryRoutes)
      await api.register(adminInventoryRoutes)
      await api.register(moodboardRoutes)
      await api.register(budgetRoutes)
      await api.register(inspirationRoutes)
      await api.register(arRoutes)
      await api.register(chatRoutes)
      await api.register(activityRoutes)
      await api.register(fileRoutes)
      await api.register(localStorageRoutes)
      await api.register(adminRoutes)
      await api.register(publicInquiryRoutes)
    },
    { prefix: API_PREFIX },
  )

  // Access-expiry sweep (docs/step-03-auth.md). Tests call expireLapsedClients directly.
  if (config.NODE_ENV !== 'test') {
    const sweep = () => {
      void expireLapsedClients(app.prisma)
        .then((n) => n > 0 && app.log.info({ expired: n }, 'access sweep: clients expired'))
        .catch((err) => app.log.error({ err }, 'access sweep failed'))
      // Uploads started but never completed (docs/step-11-files.md).
      void sweepPendingUploads({ db: app.prisma, storage: app.storage })
        .then((n) => n > 0 && app.log.info({ removed: n }, 'upload sweep: abandoned uploads removed'))
        .catch((err) => app.log.error({ err }, 'upload sweep failed'))
    }
    let timer: NodeJS.Timeout | undefined
    app.addHook('onReady', async () => {
      void sweep()
      timer = setInterval(sweep, SWEEP_INTERVAL_MS)
      timer.unref()
    })
    app.addHook('onClose', async () => clearInterval(timer))

    // Unread-message emails for people who are offline (docs/step-10-chat-activity.md).
    const digest = () =>
      sendUnreadDigests({
        db: app.prisma,
        mailer: app.mailer,
        config,
        isOnline: app.realtime.isOnline,
        onError: (err, userId) => app.log.error({ err, userId }, 'unread digest email failed'),
      })
        .then((n) => n > 0 && app.log.info({ sent: n }, 'unread digests sent'))
        .catch((err) => app.log.error({ err }, 'unread digest sweep failed'))
    let digestTimer: NodeJS.Timeout | undefined
    app.addHook('onReady', async () => {
      digestTimer = setInterval(digest, DIGEST_INTERVAL_MS)
      digestTimer.unref()
    })
    app.addHook('onClose', async () => clearInterval(digestTimer))
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
