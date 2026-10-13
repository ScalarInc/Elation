import {
  listMessagesQuery,
  listThreadsQuery,
  markReadBody,
  messagePageSchema,
  messageSchema,
  sendMessageBody,
  threadSchema,
  unreadCountSchema,
} from '@elation/shared/api'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { AppError } from '../../lib/errors'
import { assertThreadAccess } from '../../lib/policy'
import { rateLimit } from '../../lib/rate-limit'
import { currentUser } from '../../plugins/auth'
import * as chat from './service'

const threadParams = z.object({ id: z.string().max(64) })

const socketMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('subscribe'), threadId: z.string().uuid() }),
  z.object({ type: z.literal('typing'), threadId: z.string().uuid() }),
  z.object({ type: z.literal('read'), threadId: z.string().uuid(), messageId: z.string().uuid() }),
])

const TYPING_EVERY_MS = 3000
/** Frames a socket may send per second (typing + read receipts need far fewer). */
const FRAMES_PER_SECOND = 20
/** Open tabs per user; the oldest is closed beyond this. */
const SOCKETS_PER_USER = 10

/** Chat history + realtime socket (docs/step-10-chat-activity.md). */
export const chatRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.requireAuth)
  const deps = { db: app.prisma, realtime: app.realtime, storage: app.storage }

  app.get('/threads', { schema: { querystring: listThreadsQuery, response: { 200: z.array(threadSchema) } } }, async (request) =>
    chat.listThreads(deps, currentUser(request), request.query),
  )

  app.get(
    '/threads/:id/messages',
    { schema: { params: threadParams, querystring: listMessagesQuery, response: { 200: messagePageSchema } } },
    async (request) => chat.listMessages(deps, currentUser(request), request.params.id, request.query),
  )

  app.post(
    '/threads/:id/messages',
    {
      schema: { params: threadParams, body: sendMessageBody, response: { 201: messageSchema } },
      preHandler: [rateLimit({ name: 'chat-send', max: 30, windowMs: 60_000, key: (r) => currentUser(r).id })],
    },
    async (request, reply) => reply.code(201).send(await chat.sendMessage(deps, currentUser(request), request.params.id, request.body)),
  )

  app.post('/threads/:id/read', { schema: { params: threadParams, body: markReadBody } }, async (request, reply) => {
    await chat.markRead(deps, currentUser(request), request.params.id, request.body.messageId)
    return reply.code(204).send()
  })

  app.get('/unread-count', { schema: { response: { 200: unreadCountSchema } } }, async (request) =>
    chat.unreadCount(app.prisma, currentUser(request)),
  )

  app.get(
    '/ws',
    {
      websocket: true,
      // Browsers always send Origin on a WebSocket handshake; only our own pages may open one.
      preValidation: async (request) => {
        const origin = request.headers.origin
        const self = `${request.protocol}://${request.host}`
        if (origin && origin !== app.config.WEB_ORIGIN && origin !== app.config.APP_URL && origin !== self) {
          throw new AppError('BAD_ORIGIN', 403, 'Request origin not allowed')
        }
      },
    },
    (socket, request) => {
      const user = currentUser(request)
      const conn = app.realtime.add({ ws: socket, userId: user.id, role: user.role, sessionId: request.auth!.sessionId }, SOCKETS_PER_USER)
      const lastTyping = new Map<string, number>()
      let windowStart = Date.now()
      let frames = 0

      socket.on('message', (raw) => {
        const now = Date.now()
        if (now - windowStart >= 1000) {
          windowStart = now
          frames = 0
        }
        if (++frames > FRAMES_PER_SECOND) return
        let parsed
        try {
          parsed = socketMessage.safeParse(JSON.parse(String(raw)))
        } catch {
          return
        }
        if (!parsed.success) return
        const msg = parsed.data
        const run = async () => {
          if (msg.type === 'subscribe') {
            // Every thread the user can see is pushed already; subscribing only checks access.
            await assertThreadAccess(app.prisma, user, msg.threadId)
          } else if (msg.type === 'typing') {
            const now = Date.now()
            if (now - (lastTyping.get(msg.threadId) ?? 0) < TYPING_EVERY_MS) return
            lastTyping.set(msg.threadId, now)
            await assertThreadAccess(app.prisma, user, msg.threadId)
            await app.realtime.publish({ t: 'typing', threadId: msg.threadId, userId: user.id, name: user.name.split(' ')[0] })
          } else {
            await chat.markRead(deps, user, msg.threadId, msg.messageId)
          }
        }
        run().catch((err) => {
          if (!(err instanceof AppError)) request.log.error({ err }, 'socket message failed')
        })
      })
      socket.on('error', (err) => {
        request.log.warn({ err }, 'socket error')
        app.realtime.remove(conn)
      })
      socket.on('close', () => app.realtime.remove(conn))
    },
  )
}
