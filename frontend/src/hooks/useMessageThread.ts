import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Message } from '@/types'

export type ConnectionState = 'connecting' | 'live' | 'offline'

/** Row shape Supabase Realtime delivers (raw table columns). */
type MessageRow = { id: string; client_id: string; sender_id: string | null; sender_role: 'client' | 'admin'; body: string; created_at: string }

type Options = {
  /** The thread to show (the client's id). Nothing loads while undefined. */
  clientId: string | undefined
  /** Loads history, oldest first; `before` pages further back. */
  load: (before?: string) => Promise<Message[]>
  send: (body: string) => Promise<Message>
  /** Display name for a sender seen only through Realtime (history comes with names). */
  nameFor: (row: { senderId: string | null; senderRole: 'client' | 'admin' }) => string
}

const PAGE_SIZE = 50

/** Merge by id and keep chronological order, so echoes of our own sends never duplicate. */
function merge(current: Message[], incoming: Message[]): Message[] {
  const byId = new Map(current.map((m) => [m.id, m]))
  for (const m of incoming) byId.set(m.id, m)
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/**
 * One live message thread: history from the API, new messages pushed by Supabase Realtime
 * (filtered to this thread; RLS also stops other threads leaking), sends through the API.
 */
export function useMessageThread({ clientId, load, send, nameFor }: Options) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connection, setConnection] = useState<ConnectionState>('connecting')
  const [hasMore, setHasMore] = useState(false)
  // Latest callbacks without re-subscribing every render.
  const callbacks = useRef({ load, nameFor })
  useEffect(() => {
    callbacks.current = { load, nameFor }
  })

  const reload = useCallback(async () => {
    try {
      const rows = await callbacks.current.load()
      setMessages((prev) => merge(prev, rows))
      setHasMore(rows.length >= PAGE_SIZE)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!clientId) return
    let wasLive = false
    setMessages([])
    setLoading(true)
    setConnection('connecting')
    void reload()

    const channel = supabase
      .channel(`messages:${clientId}`)
      .on<MessageRow>(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `client_id=eq.${clientId}` },
        ({ new: row }) => {
          const message: Message = {
            id: row.id, clientId: row.client_id, senderId: row.sender_id, senderRole: row.sender_role, body: row.body,
            createdAt: row.created_at,
            senderName: callbacks.current.nameFor({ senderId: row.sender_id, senderRole: row.sender_role }),
          }
          setMessages((prev) => merge(prev, [message]))
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (wasLive) void reload() // catch up on anything sent while disconnected
          wasLive = true
          setConnection('live')
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnection('offline')
        }
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [clientId, reload])

  const loadOlder = useCallback(async () => {
    const oldest = messages[0]
    if (!oldest) return
    const rows = await callbacks.current.load(oldest.createdAt)
    setMessages((prev) => merge(prev, rows))
    setHasMore(rows.length >= PAGE_SIZE)
  }, [messages])

  /** Sends and adds the saved message. Throws on failure so the caller can keep the draft. */
  const sendMessage = useCallback(
    async (body: string) => {
      const saved = await send(body)
      setMessages((prev) => merge(prev, [saved]))
    },
    [send],
  )

  return { messages, loading, error, connection, hasMore, loadOlder, sendMessage, reload }
}
