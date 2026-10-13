import { WS_CLOSE_SESSION_ENDED, type ClientSocketMessage, type ServerSocketMessage } from '@elation/shared/api'
import { useEffect, useRef } from 'react'
import { API_BASE, API_MODE } from '@/lib/api/client'
import { queryClient } from '@/lib/api/query-client'

/**
 * One realtime socket per tab (docs/step-10-chat-activity.md).
 * Reconnects with exponential backoff; after a reconnect it refetches threads
 * and the feed over HTTP, because missed events are not replayed.
 */

type Handler = (msg: ServerSocketMessage) => void

const handlers = new Set<Handler>()
let ws: WebSocket | null = null
let users = 0
let retryMs = 1000
let retryTimer: number | undefined
let closeTimer: number | undefined
let hadConnection = false

function refetchAfterGap() {
  void queryClient.invalidateQueries({ queryKey: ['threads'] })
  void queryClient.invalidateQueries({ queryKey: ['unread-count'] })
  void queryClient.invalidateQueries({ queryKey: ['activity'] })
  void queryClient.invalidateQueries({ queryKey: ['thread-messages'] })
}

function open() {
  window.clearTimeout(closeTimer)
  if (ws || users === 0 || API_MODE === 'mock') return
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${API_BASE}/ws`
  const socket = new WebSocket(url)
  ws = socket
  socket.onopen = () => {
    retryMs = 1000
    if (hadConnection) refetchAfterGap()
    hadConnection = true
  }
  socket.onmessage = (e) => {
    let msg: ServerSocketMessage
    try {
      msg = JSON.parse(String(e.data)) as ServerSocketMessage
    } catch {
      return
    }
    if (msg.type === 'resync') refetchAfterGap()
    for (const h of handlers) h(msg)
  }
  socket.onclose = (e) => {
    if (ws === socket) ws = null
    if (e.code === WS_CLOSE_SESSION_ENDED) {
      // Session or access ended: /me answers 401/403 and the app routes accordingly.
      void queryClient.invalidateQueries({ queryKey: ['me'] })
      return
    }
    if (users === 0) return
    window.clearTimeout(retryTimer)
    retryTimer = window.setTimeout(open, retryMs)
    retryMs = Math.min(retryMs * 2, 30_000)
  }
}

/** Closes the socket now (sign-out: the next user must never get this user's events). */
export function disconnectRealtime() {
  window.clearTimeout(retryTimer)
  window.clearTimeout(closeTimer)
  const socket = ws
  ws = null
  hadConnection = false
  socket?.close(1000)
}

/** Keeps the socket open while a signed-in layout is mounted. */
export function useRealtimeConnection(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    users += 1
    open()
    return () => {
      users -= 1
      // Deferred, so a remount (route change, StrictMode) keeps the same socket.
      if (users === 0) closeTimer = window.setTimeout(disconnectRealtime, 1000)
    }
  }, [enabled])
}

/** Subscribe to server events while the component is mounted. */
export function useRealtime(handler: Handler) {
  const ref = useRef(handler)
  useEffect(() => {
    ref.current = handler
  })
  useEffect(() => {
    const h: Handler = (msg) => ref.current(msg)
    handlers.add(h)
    return () => {
      handlers.delete(h)
    }
  }, [])
}

/** Fire-and-forget; dropped when the socket isn't open (typing is best-effort). */
export function sendRealtime(msg: ClientSocketMessage) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
}
