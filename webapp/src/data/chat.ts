import type {
  ActivityDto,
  AttachmentDto,
  ActivityPageDto,
  MessageDto,
  MessagePageDto,
  ServerSocketMessage,
  ThreadDto,
} from '@elation/shared/api'
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query'
import { API_MODE, ApiError, apiFetch } from '@/lib/api/client'
import { useRealtime } from '@/lib/realtime'
import { activity as fixtureActivity, currentUser, messages as fixtureMessages, threads as fixtureThreads } from '@/mocks/fixtures'

/** Chat + activity feed (docs/step-10-chat-activity.md). */

/** A message as the UI holds it: server copy, or an optimistic one still sending / failed. */
export type ChatMessage = MessageDto & { status?: 'sending' | 'failed' }
type Pages = InfiniteData<{ messages: ChatMessage[]; nextBefore: string | null }, string | undefined>

// ─────────────── mock mode (no server) ───────────────

const mockThreads = (): ThreadDto[] =>
  fixtureThreads.map((t) => ({
    id: t.id,
    clientId: currentUser.id,
    clientName: currentUser.name,
    eventId: t.eventId ?? null,
    title: t.title,
    participants: t.participants.map((p) => ({ ...p, lastReadMessageId: null })),
    lastMessage: null,
    lastMessageAt: t.lastMessageAt,
    unread: t.unread,
  }))

const mockMessages = (threadId: string): MessagePageDto => ({
  messages: (threadId === fixtureThreads[0]?.id ? fixtureMessages : [])
    .map((m) => ({
      id: m.id,
      threadId,
      kind: m.authorRole === 'system' ? ('system' as const) : ('user' as const),
      author:
        m.authorRole === 'system'
          ? null
          : { id: m.authorId, name: m.authorName, role: m.authorRole, avatarInitials: m.authorName.slice(0, 2).toUpperCase() },
      body: m.body,
      meta: null,
      clientMessageId: null,
      attachments: [],
      createdAt: m.createdAt,
    }))
    .reverse(),
  nextBefore: null,
})

const needsServer = () => Promise.reject(new ApiError(0, 'MOCK_MODE', 'This needs the Elation server (VITE_API_MODE=http).'))

export const chatApi = {
  threads: (clientId?: string) =>
    API_MODE === 'mock'
      ? Promise.resolve(mockThreads())
      : apiFetch<ThreadDto[]>(`/threads${clientId ? `?clientId=${clientId}` : ''}`),
  messages: (threadId: string, before?: string) =>
    API_MODE === 'mock'
      ? Promise.resolve(mockMessages(threadId))
      : apiFetch<MessagePageDto>(`/threads/${threadId}/messages?limit=30${before ? `&before=${before}` : ''}`),
  send: (threadId: string, body: { body: string; clientMessageId: string; attachmentFileIds?: string[] }) =>
    API_MODE === 'mock' ? needsServer() : apiFetch<MessageDto>(`/threads/${threadId}/messages`, { method: 'POST', body }),
  read: (threadId: string, messageId: string) =>
    API_MODE === 'mock' ? Promise.resolve() : apiFetch<void>(`/threads/${threadId}/read`, { method: 'POST', body: { messageId } }),
  unread: () => (API_MODE === 'mock' ? Promise.resolve({ unread: 0 }) : apiFetch<{ unread: number }>('/unread-count')),
  activity: (q: { eventId?: string; cursor?: string; limit?: number }) => {
    if (API_MODE === 'mock') {
      const entries: ActivityDto[] = fixtureActivity
        .filter((a) => !q.eventId || a.eventId === q.eventId)
        .map((a) => ({ id: a.id, clientId: currentUser.id, eventId: a.eventId ?? null, kind: a.kind, title: a.title, detail: a.detail ?? null, at: a.at }))
      return Promise.resolve<ActivityPageDto>({ entries, nextCursor: null })
    }
    const params = new URLSearchParams()
    if (q.eventId) params.set('eventId', q.eventId)
    if (q.cursor) params.set('cursor', q.cursor)
    params.set('limit', String(q.limit ?? 20))
    return apiFetch<ActivityPageDto>(`/activity?${params}`)
  },
}

export const threadsKey = (clientId?: string) => ['threads', clientId ?? 'mine'] as const
export const messagesKey = (threadId: string) => ['thread-messages', threadId] as const

export function useThreads(clientId?: string) {
  return useQuery({ queryKey: threadsKey(clientId), queryFn: () => chatApi.threads(clientId) })
}

export function useMessages(threadId: string | null) {
  return useInfiniteQuery({
    queryKey: messagesKey(threadId ?? 'none'),
    queryFn: ({ pageParam }) => chatApi.messages(threadId!, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    enabled: Boolean(threadId),
    // Live updates arrive over the socket; HTTP fills history and gaps, and
    // refreshes attachment previews before their 10-minute links expire.
    staleTime: Infinity,
    refetchInterval: 8 * 60_000,
  })
}

/** Put a message into the thread's cached history, replacing its optimistic copy. */
function upsertMessage(qc: QueryClient, threadId: string, message: ChatMessage) {
  qc.setQueryData<Pages>(messagesKey(threadId), (data) => {
    if (!data) return data
    const same = (m: ChatMessage) =>
      m.id === message.id || (message.clientMessageId !== null && m.clientMessageId === message.clientMessageId && m.author?.id === message.author?.id)
    const known = data.pages.some((p) => p.messages.some(same))
    const pages = data.pages.map((p, i) => {
      const rest = p.messages.map((m) => (same(m) ? message : m))
      return i === 0 && !known ? { ...p, messages: [message, ...rest] } : { ...p, messages: rest }
    })
    return { ...data, pages }
  })
}

let seq = 0
export const newClientMessageId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `m-${Date.now()}-${++seq}`

export function useSendMessage(threadId: string | null, me: { id: string; name: string; role: string; avatarInitials: string }) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { body: string; clientMessageId: string; attachments?: AttachmentDto[] }) =>
      chatApi.send(threadId!, { body: v.body, clientMessageId: v.clientMessageId, attachmentFileIds: v.attachments?.map((a) => a.id) }),
    onMutate: (v) => {
      upsertMessage(qc, threadId!, {
        id: `local-${v.clientMessageId}`,
        threadId: threadId!,
        kind: 'user',
        author: { id: me.id, name: me.name, role: me.role === 'client' ? 'client' : 'consultant', avatarInitials: me.avatarInitials },
        body: v.body,
        meta: null,
        clientMessageId: v.clientMessageId,
        attachments: v.attachments ?? [],
        createdAt: new Date().toISOString(),
        status: 'sending',
      })
    },
    onSuccess: (message) => {
      upsertMessage(qc, message.threadId, message)
      void qc.invalidateQueries({ queryKey: ['threads'] })
    },
    onError: (_err, v) => {
      qc.setQueryData<Pages>(messagesKey(threadId!), (data) =>
        data && {
          ...data,
          pages: data.pages.map((p) => ({
            ...p,
            messages: p.messages.map((m) => (m.clientMessageId === v.clientMessageId && m.status ? { ...m, status: 'failed' as const } : m)),
          })),
        },
      )
    },
  })
}
export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { threadId: string; messageId: string }) => chatApi.read(v.threadId, v.messageId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['unread-count'] })
      void qc.invalidateQueries({ queryKey: ['threads'] })
    },
  })
}

export function useUnreadCount() {
  return useQuery({ queryKey: ['unread-count'], queryFn: chatApi.unread, refetchInterval: 5 * 60_000 })
}

export function useActivity(eventId?: string, limit = 20) {
  return useQuery({ queryKey: ['activity', eventId ?? 'all', limit], queryFn: () => chatApi.activity({ eventId, limit }) })
}

/**
 * Keeps cached chat data in step with the socket. Mounted once per layout.
 * Typing indicators are handled by the page that shows them.
 */
export function useRealtimeCacheSync() {
  const qc = useQueryClient()
  useRealtime((msg: ServerSocketMessage) => {
    switch (msg.type) {
      case 'message.created':
        upsertMessage(qc, msg.threadId, msg.message)
        void qc.invalidateQueries({ queryKey: ['threads'] })
        void qc.invalidateQueries({ queryKey: ['unread-count'] })
        return
      case 'message.read':
        qc.setQueriesData<ThreadDto[]>({ queryKey: ['threads'] }, (threads) =>
          threads?.map((t) =>
            t.id !== msg.threadId
              ? t
              : { ...t, participants: t.participants.map((p) => (p.id === msg.userId ? { ...p, lastReadMessageId: msg.messageId } : p)) },
          ),
        )
        return
      case 'activity.created':
        void qc.invalidateQueries({ queryKey: ['activity'] })
        return
    }
  })
}
