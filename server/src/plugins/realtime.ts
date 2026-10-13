import websocket from '@fastify/websocket'
import { WS_CLOSE_SESSION_ENDED, type ServerSocketMessage } from '@elation/shared/api'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import pg from 'pg'
import type { WebSocket } from 'ws'
import type { Role } from '../generated/prisma/client'
import { accessProblem } from '../modules/auth/access'
import { toActivityDto } from '../modules/activity/service'
import { toMessageDto } from '../modules/chat/service'

/**
 * Realtime hub (docs/step-10-chat-activity.md, P9 / P37).
 *
 * Every event goes through Postgres: new messages and activity entries are
 * announced by triggers on commit, typing and read receipts by `publish`.
 * Each API instance LISTENs and fans out to its own sockets, so the hub works
 * the same with one instance or several.
 */

export const CHANNEL = 'elation_events'

/** What travels on the channel. Ids only for rows (NOTIFY payloads cap at 8 kB). */
export type ChannelEvent =
  | { t: 'message'; id: string; threadId: string }
  | { t: 'activity'; id: string; clientId: string }
  | { t: 'read'; threadId: string; userId: string; messageId: string }
  | { t: 'typing'; threadId: string; userId: string; name: string }

type Conn = { ws: WebSocket; userId: string; role: Role; sessionId: string; alive: boolean }

export type Realtime = {
  publish: (event: ChannelEvent) => Promise<void>
  /** Open sockets for this user on this instance. */
  isOnline: (userId: string) => boolean
  /** Close sockets whose session ended or whose access lapsed. Runs every 5 minutes. */
  recheckSessions: () => Promise<number>
  /** Resolves once the LISTEN connection is up (tests). */
  ready: () => Promise<void>
  /** Registers a socket; beyond `maxPerUser` the user's oldest socket is closed. */
  add: (conn: Omit<Conn, 'alive'>, maxPerUser?: number) => Conn
  remove: (conn: Conn) => void
}

declare module 'fastify' {
  interface FastifyInstance {
    realtime: Realtime
  }
}

const PING_MS = 25_000
const RECHECK_MS = 5 * 60_000

/**
 * `databaseUrl` must be a direct (session) connection: LISTEN doesn't survive a
 * transaction-mode pooler. Set DATABASE_LISTEN_URL when DATABASE_URL is pooled.
 */
export default fp<{ databaseUrl: string }>(async function realtimePlugin(app: FastifyInstance, opts) {
  await app.register(websocket, { options: { maxPayload: 16 * 1024 } })

  const byUser = new Map<string, Set<Conn>>()
  const all = () => [...byUser.values()].flatMap((s) => [...s])

  function send(conn: Conn, msg: ServerSocketMessage) {
    if (conn.ws.readyState === conn.ws.OPEN) conn.ws.send(JSON.stringify(msg))
  }

  /** Who may see a thread: the client, their consultant, participants, and admins. */
  async function threadAudience(threadId: string) {
    const thread = await app.prisma.thread.findUnique({ where: { id: threadId }, include: { participants: { select: { userId: true } } } })
    if (!thread) return null
    const client = await app.prisma.user.findUnique({ where: { id: thread.clientId }, select: { consultantId: true }, })
    const people = new Set([thread.clientId, ...thread.participants.map((p) => p.userId)])
    if (client?.consultantId) people.add(client.consultantId)
    return (c: Conn) => c.role === 'ADMIN' || people.has(c.userId)
  }

  async function dispatch(event: ChannelEvent) {
    switch (event.t) {
      case 'message': {
        const [message, canSee] = await Promise.all([
          app.prisma.message.findUnique({ where: { id: event.id }, include: { author: { select: { id: true, name: true, role: true } } } }),
          threadAudience(event.threadId),
        ])
        if (!message || !canSee) return
        const dto = toMessageDto(message)
        for (const c of all()) if (canSee(c)) send(c, { type: 'message.created', threadId: event.threadId, message: dto })
        return
      }
      case 'activity': {
        const [entry, client] = await Promise.all([
          app.prisma.activityEntry.findUnique({ where: { id: event.id } }),
          app.prisma.user.findUnique({ where: { id: event.clientId }, select: { consultantId: true } }),
        ])
        if (!entry) return
        // Same rule as the feed: archived or deleted events stay out.
        if (entry.eventId) {
          const event = await app.prisma.event.findUnique({ where: { id: entry.eventId } })
          if (!event || event.status === 'ARCHIVED') return
        }
        const dto = toActivityDto(entry)
        for (const c of all()) {
          if (c.role === 'ADMIN' || c.userId === event.clientId || c.userId === client?.consultantId) send(c, { type: 'activity.created', entry: dto })
        }
        return
      }
      case 'read':
      case 'typing': {
        const canSee = await threadAudience(event.threadId)
        if (!canSee) return
        const msg: ServerSocketMessage =
          event.t === 'read'
            ? { type: 'message.read', threadId: event.threadId, userId: event.userId, messageId: event.messageId }
            : { type: 'typing', threadId: event.threadId, userId: event.userId, name: event.name }
        for (const c of all()) if (c.userId !== event.userId && canSee(c)) send(c, msg)
        return
      }
    }
  }

  // ─── LISTEN connection, reconnecting with backoff ───
  let listener: pg.Client | null = null
  let closing = false
  let lostConnection = false
  let retryMs = 1000
  let readyResolve!: () => void
  const readyPromise = new Promise<void>((r) => (readyResolve = r))

  async function connect() {
    const client = new pg.Client({ connectionString: opts.databaseUrl })
    client.on('notification', (n) => {
      if (n.channel !== CHANNEL || !n.payload) return
      let event: ChannelEvent
      try {
        event = JSON.parse(n.payload) as ChannelEvent
      } catch {
        return
      }
      dispatch(event).catch((err) => app.log.error({ err, event: event.t }, 'realtime dispatch failed'))
    })
    let dropped = false
    const onLost = (err?: Error) => {
      if (dropped || closing) return
      dropped = true
      lostConnection = true
      app.log.warn({ err }, 'realtime listener lost its connection')
      client.end().catch(() => {})
      if (listener === client) listener = null
      setTimeout(() => void connect(), retryMs).unref()
      retryMs = Math.min(retryMs * 2, 30_000)
    }
    client.on('error', onLost)
    client.on('end', () => onLost())
    try {
      await client.connect()
      await client.query(`LISTEN ${CHANNEL}`)
      listener = client
      retryMs = 1000
      readyResolve()
      if (lostConnection) {
        // Events in the gap were missed: every open tab refetches over HTTP.
        lostConnection = false
        for (const c of all()) send(c, { type: 'resync' })
      }
    } catch (err) {
      app.log.warn({ err }, 'realtime listener could not connect; retrying')
      lostConnection = true
      dropped = true
      client.end().catch(() => {})
      if (!closing) setTimeout(() => void connect(), retryMs).unref()
      retryMs = Math.min(retryMs * 2, 30_000)
    }
  }

  async function recheckSessions() {
    const conns = all()
    if (conns.length === 0) return 0
    const sessions = await app.prisma.session.findMany({
      where: { id: { in: [...new Set(conns.map((c) => c.sessionId))] } },
      include: { user: true },
    })
    const valid = new Set(
      sessions.filter((s) => s.expiresAt > new Date() && !s.user.deletedAt && !accessProblem(s.user)).map((s) => s.id),
    )
    let closed = 0
    for (const c of conns) {
      if (valid.has(c.sessionId)) continue
      c.ws.close(WS_CLOSE_SESSION_ENDED, 'Session ended')
      closed += 1
    }
    return closed
  }

  const realtime: Realtime = {
    publish: async (event) => {
      await app.prisma.$executeRaw`SELECT pg_notify(${CHANNEL}, ${JSON.stringify(event)})`
    },
    isOnline: (userId) => (byUser.get(userId)?.size ?? 0) > 0,
    recheckSessions,
    ready: () => readyPromise,
    add: (input, maxPerUser = Infinity) => {
      const conn: Conn = { ...input, alive: true }
      let set = byUser.get(conn.userId)
      if (!set) byUser.set(conn.userId, (set = new Set()))
      set.add(conn)
      if (set.size > maxPerUser) {
        const oldest = set.values().next().value!
        set.delete(oldest)
        oldest.ws.close(1008, 'Too many open tabs')
      }
      conn.ws.on('pong', () => (conn.alive = true))
      return conn
    },
    remove: (conn) => {
      const set = byUser.get(conn.userId)
      set?.delete(conn)
      if (set?.size === 0) byUser.delete(conn.userId)
    },
  }
  app.decorate('realtime', realtime)

  let pingTimer: NodeJS.Timeout | undefined
  let recheckTimer: NodeJS.Timeout | undefined
  app.addHook('onReady', async () => {
    void connect()
    pingTimer = setInterval(() => {
      for (const c of all()) {
        if (!c.alive) {
          c.ws.terminate()
          continue
        }
        c.alive = false
        c.ws.ping()
      }
    }, PING_MS)
    pingTimer.unref()
    recheckTimer = setInterval(() => {
      recheckSessions().catch((err) => app.log.error({ err }, 'realtime session recheck failed'))
    }, RECHECK_MS)
    recheckTimer.unref()
  })
  app.addHook('preClose', async () => {
    closing = true
    clearInterval(pingTimer)
    clearInterval(recheckTimer)
    for (const c of all()) c.ws.close(1001, 'Server shutting down')
    await listener?.end().catch(() => {})
  })
})
