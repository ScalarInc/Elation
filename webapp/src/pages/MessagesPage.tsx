import type * as React from 'react'
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, ArrowLeft, MessageCircle, Paperclip, RotateCw, Search, Send, Sparkles } from 'lucide-react'
import { MESSAGE_MAX, type ThreadDto } from '@elation/shared/api'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCurrentUser } from '@/data/auth'
import {
  newClientMessageId,
  useMarkRead,
  useMessages,
  useSendMessage,
  useThreads,
  type ChatMessage,
} from '@/data/chat'
import { isApiError } from '@/lib/api/client'
import { sendRealtime, useRealtime } from '@/lib/realtime'
import { cn } from '@/lib/utils'

function relativeTime(iso: string) {
  const then = new Date(iso).getTime()
  const diff = Math.max(0, Date.now() - then)
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(then)
}

function dateKey(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function dividerLabel(iso: string) {
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (dateKey(iso) === dateKey(today.toISOString())) return 'Today'
  if (dateKey(iso) === dateKey(yesterday.toISOString())) return 'Yesterday'
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))
}

function bubbleTime(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

type Grouped = { key: string; label: string; items: ChatMessage[] }

/** Oldest-first list → day groups. */
function groupByDay(list: ChatMessage[]): Grouped[] {
  const out: Grouped[] = []
  for (const m of list) {
    const key = dateKey(m.createdAt)
    let bucket = out.at(-1)
    if (!bucket || bucket.key !== key) {
      bucket = { key, label: dividerLabel(m.createdAt), items: [] }
      out.push(bucket)
    }
    bucket.items.push(m)
  }
  return out
}

const URL_RE = /(https?:\/\/[^\s<>"']+)/g

/** Plain text with line breaks and clickable links — never HTML. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_RE)
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-2">
            {part}
          </a>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  )
}

/** The person on the other side of a thread, from the viewer's point of view. */
function counterpart(thread: ThreadDto, viewerIsClient: boolean, meId: string) {
  if (!viewerIsClient) return { name: thread.clientName, initials: initialsOf(thread.clientName), label: thread.title }
  const staff = thread.participants.find((p) => p.role === 'consultant' && p.id !== meId)
  return { name: staff?.name ?? 'Elation', initials: staff?.avatarInitials ?? 'EX', label: thread.title }
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/)
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2)).toUpperCase()
}

function ThreadRow({ thread, isActive, onClick, viewerIsClient, meId }: {
  thread: ThreadDto
  isActive: boolean
  onClick: () => void
  viewerIsClient: boolean
  meId: string
}) {
  const who = counterpart(thread, viewerIsClient, meId)
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-3 rounded-2xl p-3 text-left transition hover:bg-surface-2',
        isActive && 'bg-surface-2 border-l-2 border-l-accent',
      )}
    >
      <Avatar className="h-11 w-11">
        <AvatarFallback>{who.initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-text truncate text-sm font-semibold">{who.label}</p>
          {thread.lastMessage && (
            <span className="text-muted/70 shrink-0 text-[10px]">{relativeTime(thread.lastMessage.createdAt)}</span>
          )}
        </div>
        <p className="text-muted mt-0.5 truncate text-xs">
          {thread.lastMessage
            ? `${thread.lastMessage.author?.id === meId ? 'You: ' : ''}${thread.lastMessage.body}`
            : viewerIsClient
              ? `With ${who.name}`
              : who.name}
        </p>
      </div>
      {thread.unread > 0 && (
        <span className="bg-accent text-accent-fg mt-1 inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold">
          {thread.unread}
        </span>
      )}
    </button>
  )
}

function Bubble({ m, mine, showAvatar, onRetry, linkable }: {
  m: ChatMessage
  mine: boolean
  showAvatar: boolean
  onRetry: () => void
  /** Client pages exist only for clients; staff see the note alone. */
  linkable: boolean
}) {
  if (m.kind === 'system') {
    const link = linkable ? systemLink(m.meta) : null
    return (
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.25 }} className="flex justify-center">
        <span className="bg-surface-2 text-muted inline-flex max-w-[85%] items-center gap-1.5 rounded-2xl px-3 py-1 text-center text-[11px]">
          <Sparkles className="text-accent h-3 w-3 shrink-0" />
          <span className="whitespace-pre-wrap">
            <Linkified text={m.body} />
            {link && (
              <>
                {' '}
                <Link to={link.to} className="text-accent font-semibold whitespace-nowrap hover:underline">
                  {link.label} →
                </Link>
              </>
            )}
          </span>
        </span>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className={cn('flex items-end gap-2', mine ? 'justify-end' : 'justify-start')}
    >
      {!mine &&
        (showAvatar ? (
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-[10px]">{m.author?.avatarInitials ?? 'EX'}</AvatarFallback>
          </Avatar>
        ) : (
          <span className="w-8 shrink-0" aria-hidden />
        ))}

      <div
        className={cn(
          'max-w-[70%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm',
          mine ? 'bg-blush/70 text-ink rounded-br-md' : 'bg-surface-2 text-text rounded-bl-md',
          m.status === 'sending' && 'opacity-70',
        )}
      >
        {!mine && showAvatar && m.author && <p className="text-muted mb-0.5 text-[10px] font-semibold">{m.author.name}</p>}
        <p className="whitespace-pre-wrap break-words">
          <Linkified text={m.body} />
        </p>
        <p className={cn('mt-1 text-[10px]', mine ? 'text-ink/60 text-right' : 'text-muted/70')}>
          {m.status === 'sending' ? 'Sending…' : bubbleTime(m.createdAt)}
        </p>
        {m.status === 'failed' && (
          <button type="button" onClick={onRetry} className="text-danger mt-1 flex items-center gap-1 text-[11px] font-semibold">
            <AlertCircle className="h-3 w-3" /> Not sent — tap to retry
          </button>
        )}
      </div>
    </motion.div>
  )
}

const TYPING_SHOWN_MS = 4000
/** Matches the server's throttle. */
const TYPING_SEND_EVERY_MS = 3000

function usePageVisible() {
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden')
  useEffect(() => {
    const on = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])
  return visible
}

/** Where a system note points: its event's budget, moodboards or AR page. */
function systemLink(meta: Record<string, unknown> | null): { to: string; label: string } | null {
  const type = typeof meta?.type === 'string' ? meta.type : ''
  const eventId = typeof meta?.eventId === 'string' ? meta.eventId : null
  if (!eventId) return null
  if (type.startsWith('budget.')) return { to: `/events/${eventId}/budget`, label: 'Open budget' }
  if (type.startsWith('moodboard.') || type === 'inspiration.adopted') return { to: `/events/${eventId}?tab=moodboard`, label: 'See moodboards' }
  if (type.startsWith('ar.')) return { to: `/events/${eventId}/ar`, label: 'Open AR' }
  return null
}

export function MessagesPage({ className }: { className?: string }) {
  const me = useCurrentUser()
  const viewerIsClient = me.role === 'client'
  const [params, setParams] = useSearchParams()
  const threadsQuery = useThreads()
  const threads = useMemo(() => threadsQuery.data ?? [], [threadsQuery.data])
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')
  const [typing, setTyping] = useState<{ threadId: string; name: string; until: number } | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // ?thread= deep links (emails, event page); else the most recent conversation.
  const requested = params.get('thread')
  const activeThreadId = threads.find((t) => t.id === requested)?.id ?? threads[0]?.id ?? null
  const activeThread = threads.find((t) => t.id === activeThreadId) ?? null
  const selectThread = (id: string) => setParams((p) => {
    p.set('thread', id)
    return p
  }, { replace: true })
  const showConversationOnMobile = Boolean(requested && activeThread)

  const messagesQuery = useMessages(activeThreadId)
  const send = useSendMessage(activeThreadId, me)
  const markRead = useMarkRead()

  // Pages are newest-first; the list renders oldest-first.
  const messages = useMemo(() => (messagesQuery.data?.pages.flatMap((p) => p.messages as ChatMessage[]) ?? []).slice().reverse(), [messagesQuery.data])
  const grouped = useMemo(() => groupByDay(messages), [messages])

  useRealtime((msg) => {
    if (msg.type === 'typing' && msg.threadId === activeThreadId) {
      setTyping({ threadId: msg.threadId, name: msg.name, until: Date.now() + TYPING_SHOWN_MS })
    }
    // A message from them ends their typing indicator.
    if (msg.type === 'message.created' && msg.message.author?.id !== me.id) setTyping(null)
  })
  useEffect(() => {
    if (!typing) return
    const t = window.setTimeout(() => setTyping(null), Math.max(0, typing.until - Date.now()))
    return () => window.clearTimeout(t)
  }, [typing])
  const isTyping = typing?.threadId === activeThreadId

  // Mark the newest message from others as read while the conversation is open.
  const newestFromOthers = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (!m.status && m.author?.id !== me.id) return m.id
    }
    return null
  }, [messages, me.id])
  const myLastRead = activeThread?.participants.find((p) => p.id === me.id)?.lastReadMessageId ?? null
  const { mutate: markReadMutate } = markRead
  const visible = usePageVisible()
  // Sent once per message: the thread list refetch that confirms it can lag behind.
  const markedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!activeThreadId || !newestFromOthers || !visible) return
    if ((myLastRead && myLastRead >= newestFromOthers) || markedRef.current === newestFromOthers) return
    markedRef.current = newestFromOthers
    markReadMutate({ threadId: activeThreadId, messageId: newestFromOthers })
  }, [activeThreadId, newestFromOthers, myLastRead, markReadMutate, visible])

  // Read receipt: under my latest message, once someone else has read it.
  const lastMine = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].author?.id === me.id && !messages[i].status) return messages[i]
    return null
  }, [messages, me.id])
  const seenBy = useMemo(() => {
    if (!lastMine || !activeThread) return null
    const readers = activeThread.participants.filter((p) => p.id !== me.id && p.lastReadMessageId && p.lastReadMessageId >= lastMine.id)
    return readers.length ? readers.map((r) => r.name.split(' ')[0]).join(', ') : null
  }, [lastMine, activeThread, me.id])

  // Stick to the bottom for new messages; keep position when older history loads above.
  const prevHeight = useRef(0)
  const loadingOlder = useRef(false)
  const nearBottom = useRef(true)
  const forceBottom = useRef(true)
  useEffect(() => {
    forceBottom.current = true // a newly opened conversation starts at its latest message
  }, [activeThreadId])
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (loadingOlder.current) {
      el.scrollTop = el.scrollHeight - prevHeight.current
      loadingOlder.current = false
    } else if (nearBottom.current || forceBottom.current) {
      // Someone reading older history isn't yanked down by a new message.
      el.scrollTop = el.scrollHeight
      if (messages.length > 0) forceBottom.current = false
    }
  }, [messages, isTyping])
  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    if (el.scrollTop > 80 || !messagesQuery.hasNextPage || messagesQuery.isFetchingNextPage) return
    prevHeight.current = el.scrollHeight
    loadingOlder.current = true
    void messagesQuery.fetchNextPage()
  }

  // Auto-resize textarea (cap at 6 lines).
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 20 * 6 + 24)}px`
  }, [draft])

  const filteredThreads = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return threads
    return threads.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.clientName.toLowerCase().includes(q) ||
        t.participants.some((p) => p.name.toLowerCase().includes(q)),
    )
  }, [threads, query])

  function deliver(body: string, clientMessageId: string) {
    send.mutate(
      { body, clientMessageId },
      {
        onError: (err) => {
          const description = isApiError(err, 'RATE_LIMITED') ? 'You’re sending quickly — wait a moment and retry.' : 'Tap the message to retry.'
          toast.error('Message not sent', { description })
        },
      },
    )
  }

  function handleSend() {
    const body = draft.trim()
    if (!body || !activeThreadId) return
    setDraft('')
    forceBottom.current = true
    deliver(body, newClientMessageId())
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const lastTypingSent = useRef(0)
  function handleDraft(value: string) {
    setDraft(value)
    const now = Date.now()
    if (activeThreadId && value.trim() && now - lastTypingSent.current > TYPING_SEND_EVERY_MS) {
      lastTypingSent.current = now
      sendRealtime({ type: 'typing', threadId: activeThreadId })
    }
  }

  const who = activeThread ? counterpart(activeThread, viewerIsClient, me.id) : null
  const loading = threadsQuery.isPending

  return (
    <div className={cn('flex h-[calc(100vh-73px)] overflow-hidden', className)}>
      {/* Left pane: threads */}
      <aside className={cn('border-border/10 w-full shrink-0 flex-col border-r md:flex md:w-80', showConversationOnMobile ? 'hidden' : 'flex')}>
        <div className="border-border/10 border-b p-5">
          <h1 className="font-display text-text text-2xl">Messages</h1>
          <div className="mt-3 flex items-center gap-2">
            <div className="border-border/15 bg-surface flex flex-1 items-center gap-2 rounded-xl border px-3">
              <Search className="text-muted/60 h-4 w-4" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={viewerIsClient ? 'Search threads…' : 'Search clients or events…'}
                aria-label="Search threads"
                className="h-9 border-0 bg-transparent px-0 focus:border-0"
              />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex justify-center p-6">
              <Spinner />
            </div>
          ) : threadsQuery.isError ? (
            <div className="p-6 text-center">
              <p className="text-muted text-xs">Couldn’t load your conversations.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void threadsQuery.refetch()}>
                <RotateCw className="h-3.5 w-3.5" /> Try again
              </Button>
            </div>
          ) : filteredThreads.length === 0 ? (
            <p className="text-muted p-6 text-center text-xs">
              {threads.length === 0 ? 'No conversations yet.' : 'No threads match your search.'}
            </p>
          ) : (
            <div className="space-y-1">
              {filteredThreads.map((t) => (
                <ThreadRow
                  key={t.id}
                  thread={t}
                  isActive={t.id === activeThreadId}
                  onClick={() => selectThread(t.id)}
                  viewerIsClient={viewerIsClient}
                  meId={me.id}
                />
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Right pane: conversation */}
      <section className={cn('min-w-0 flex-1 flex-col md:flex', showConversationOnMobile ? 'flex' : 'hidden')}>
        <header className="border-border/10 flex items-center gap-3 border-b px-4 py-4 md:px-6">
          <button
            type="button"
            aria-label="Back to conversations"
            onClick={() => setParams((p) => {
              p.delete('thread')
              return p
            })}
            className="text-muted hover:text-text rounded-lg p-1 md:hidden"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          {who && activeThread ? (
            <>
              <Avatar className="h-11 w-11">
                <AvatarFallback>{who.initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-text truncate text-sm font-semibold">{activeThread.title}</p>
                <p className="text-muted/70 mt-0.5 truncate text-[11px]">
                  {viewerIsClient ? `With ${who.name}, your consultant` : `${who.name} · client`}
                </p>
              </div>
            </>
          ) : (
            <p className="text-muted text-sm">{loading ? 'Loading…' : 'No conversation selected'}</p>
          )}
        </header>

        <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-4 py-6 md:px-6">
          {messagesQuery.isPending && activeThreadId ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : messagesQuery.isError ? (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <p className="text-muted text-sm">Couldn’t load this conversation.</p>
              <Button variant="outline" size="sm" onClick={() => void messagesQuery.refetch()}>
                <RotateCw className="h-3.5 w-3.5" /> Try again
              </Button>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <Card className="max-w-md">
                <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                  <span className="bg-accent/15 text-accent flex h-12 w-12 items-center justify-center rounded-2xl">
                    <MessageCircle className="h-5 w-5" />
                  </span>
                  <p className="font-display text-text text-lg">
                    {viewerIsClient ? `Welcome, ${me.name.split(' ')[0]}` : 'No messages yet'}
                  </p>
                  <p className="text-muted text-sm">
                    {viewerIsClient
                      ? `${who?.name ?? 'Your consultant'} is here to guide you through every detail. Send a message any time.`
                      : `Say hello to ${who?.name ?? 'your client'}.`}
                  </p>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-5">
              {messagesQuery.isFetchingNextPage && (
                <div className="flex justify-center">
                  <Spinner />
                </div>
              )}
              <AnimatePresence initial={false}>
                {grouped.map((group) => (
                  <div key={group.key} className="space-y-3">
                    <div className="flex items-center justify-center">
                      <span className="text-muted/70 bg-surface-2 rounded-full px-3 py-0.5 text-[10px] font-bold uppercase tracking-widest">
                        {group.label}
                      </span>
                    </div>
                    {group.items.map((m, idx) => {
                      const prev = group.items[idx - 1]
                      const showAvatar = !prev || prev.kind !== m.kind || prev.author?.id !== m.author?.id
                      return (
                        <div key={m.clientMessageId && m.author?.id === me.id ? `c-${m.clientMessageId}` : m.id} className="space-y-1">
                          <Bubble
                            m={m}
                            mine={m.author?.id === me.id}
                            showAvatar={showAvatar}
                            onRetry={() => deliver(m.body, m.clientMessageId!)}
                            linkable={viewerIsClient}
                          />
                          {m.id === lastMine?.id && seenBy && (
                            <p className="text-muted/70 pr-1 text-right text-[10px]">Seen by {seenBy}</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </AnimatePresence>

              {isTyping && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2">
                  <span className="w-8 shrink-0" aria-hidden />
                  <div className="bg-surface-2 text-muted flex items-center gap-1 rounded-2xl rounded-bl-md px-4 py-2.5 text-xs" aria-live="polite">
                    <span>{typing?.name} is typing</span>
                    <span className="flex gap-0.5">
                      <span className="bg-muted/60 h-1 w-1 animate-bounce rounded-full" />
                      <span className="bg-muted/60 h-1 w-1 animate-bounce rounded-full" style={{ animationDelay: '0.15s' }} />
                      <span className="bg-muted/60 h-1 w-1 animate-bounce rounded-full" style={{ animationDelay: '0.3s' }} />
                    </span>
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-border/10 sticky bottom-0 border-t bg-surface px-4 py-4 md:px-6">
          <div className="border-border/15 bg-surface mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border p-2">
            <Tooltip>
              <TooltipTrigger asChild>
                {/* Attachments arrive with file uploads (Step 11). */}
                <span tabIndex={0}>
                  <Button variant="ghost" size="icon" aria-label="Attach file (coming soon)" type="button" disabled>
                    <Paperclip className="h-4 w-4" />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Attachments are coming soon</TooltipContent>
            </Tooltip>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => handleDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              maxLength={MESSAGE_MAX}
              disabled={!activeThreadId}
              aria-label="Message"
              placeholder="Write a message…"
              className="text-text placeholder:text-muted/60 min-h-[40px] flex-1 resize-none border-0 bg-transparent px-2 py-2 text-sm leading-5 outline-none"
            />
            <Button onClick={handleSend} disabled={!draft.trim() || !activeThreadId} size="icon" aria-label="Send message">
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-muted/60 mx-auto mt-2 hidden max-w-3xl text-[10px] md:block">
            <kbd className="border-border/15 rounded border px-1">Enter</kbd> to send ·{' '}
            <kbd className="border-border/15 rounded border px-1">Shift + Enter</kbd> for a new line
          </p>
        </div>
      </section>
    </div>
  )
}
