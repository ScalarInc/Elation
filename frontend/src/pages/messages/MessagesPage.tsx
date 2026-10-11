import type * as React from 'react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Paperclip,
  Phone,
  Search,
  Send,
  Smile,
  Sparkles,
  Video,
  MoreHorizontal,
  MessageCircle,
  FileText,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'
import { api } from '@/api'
import { cn } from '@/lib/utils'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import type { Message, MessageThread } from '@/types'

function relativeTime(iso: string) {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diff = Math.max(0, now - then)
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
  const d = new Date(iso)
  const today = new Date()
  const y = new Date()
  y.setDate(today.getDate() - 1)
  if (dateKey(d.toISOString()) === dateKey(today.toISOString())) return 'Today'
  if (dateKey(d.toISOString()) === dateKey(y.toISOString())) return 'Yesterday'
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(d)
}

function bubbleTime(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  )
}

type Grouped = { key: string; label: string; items: Message[] }

function groupByDay(list: Message[]): Grouped[] {
  const out: Grouped[] = []
  for (const m of list) {
    const key = dateKey(m.createdAt)
    let bucket = out.find((g) => g.key === key)
    if (!bucket) {
      bucket = { key, label: dividerLabel(m.createdAt), items: [] }
      out.push(bucket)
    }
    bucket.items.push(m)
  }
  return out
}

function ThreadRow({
  thread,
  isActive,
  onClick,
}: {
  thread: MessageThread
  isActive: boolean
  onClick: () => void
}) {
  const consultant =
    thread.participants.find((p) => p.role === 'consultant') ?? thread.participants[0]

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
        <AvatarFallback>{consultant.avatarInitials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-text truncate text-sm font-semibold">{consultant.name}</p>
          <span className="text-muted/70 shrink-0 text-[10px]">
            {relativeTime(thread.lastMessageAt)}
          </span>
        </div>
        <p className="text-muted mt-0.5 truncate text-xs">{thread.title}</p>
      </div>
      {thread.unread > 0 && (
        <span className="bg-accent text-accent-fg mt-1 inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold">
          {thread.unread}
        </span>
      )}
    </button>
  )
}

function Bubble({ m, showAvatar }: { m: Message; showAvatar: boolean }) {
  const isClient = m.authorRole === 'client'
  const isSystem = m.authorRole === 'system'

  if (isSystem) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25 }}
        className="flex justify-center"
      >
        <span className="bg-surface-2 text-muted inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px]">
          <Sparkles className="text-accent h-3 w-3" />
          {m.body}
        </span>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className={cn('flex items-end gap-2', isClient ? 'justify-end' : 'justify-start')}
    >
      {!isClient && showAvatar ? (
        <Avatar className="h-8 w-8">
          <AvatarFallback className="text-[10px]">
            {m.authorName
              .split(' ')
              .map((s) => s[0])
              .join('')
              .slice(0, 2)}
          </AvatarFallback>
        </Avatar>
      ) : (
        !isClient && <span className="w-8 shrink-0" aria-hidden />
      )}

      <div
        className={cn(
          'max-w-[70%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm',
          isClient ? 'bg-blush/70 text-ink rounded-br-md' : 'bg-surface-2 text-text rounded-bl-md',
        )}
      >
        <p className="whitespace-pre-wrap">{m.body}</p>
        {m.attachments && m.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {m.attachments.map((a) => (
              <span
                key={a.url}
                className="border-border/15 bg-surface text-text inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px]"
              >
                <FileText className="h-3 w-3" />
                {a.name}
              </span>
            ))}
          </div>
        )}
        <p
          className={cn(
            'mt-1 text-[10px]',
            isClient ? 'text-ink/60 text-right' : 'text-muted/70',
          )}
        >
          {bubbleTime(m.createdAt)}
        </p>
      </div>
    </motion.div>
  )
}

export function MessagesPage() {
  const user = useCurrentUser()
  const [threads, setThreads] = useState<MessageThread[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')
  // TODO(backend): drive from realtime typing events once messaging is connected.
  const [isTyping] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [t, m] = await Promise.all([api.messages.threads(), api.messages.thread()])
      if (cancelled) return
      setThreads(t)
      setActiveThreadId(t[0]?.id ?? null)
      setMessages(m)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  // Auto-scroll to bottom on new message or typing indicator.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, isTyping])

  // Auto-resize textarea (cap at 6 lines).
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const lineHeight = 20
    const max = lineHeight * 6 + 24
    el.style.height = `${Math.min(el.scrollHeight, max)}px`
  }, [draft])

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeThreadId) ?? null,
    [threads, activeThreadId],
  )
  const consultant =
    activeThread?.participants.find((p) => p.role === 'consultant') ?? null

  const filteredThreads = useMemo(() => {
    if (!query.trim()) return threads
    const q = query.toLowerCase()
    return threads.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.participants.some((p) => p.name.toLowerCase().includes(q)),
    )
  }, [threads, query])

  const grouped = useMemo(() => groupByDay(messages), [messages])

  // Determine last client message index for read receipt.
  const lastClientMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].authorRole === 'client') return messages[i].id
    }
    return null
  }, [messages])

  async function handleSend() {
    const body = draft.trim()
    if (!body || !user) return
    const optimistic: Message = {
      id: `msg_local_${Date.now()}`,
      authorId: user.id,
      authorName: user.name,
      authorRole: 'client',
      body,
      createdAt: new Date().toISOString(),
      read: false,
    }
    setMessages((prev) => [...prev, optimistic])
    setDraft('')

    try {
      const saved = await api.messages.send(body)
      setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? saved : m)))
    } catch {
      // Roll back so an unsent message never looks delivered.
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
      setDraft(body)
      toast.error('Message failed to send', { description: 'Please try again.' })
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex h-[calc(100vh-73px)] overflow-hidden">
      {/* Left pane: threads */}
      <aside className="border-border/10 flex w-80 shrink-0 flex-col border-r">
        <div className="border-border/10 border-b p-5">
          <h1 className="font-display text-text text-2xl">Messages</h1>
          <div className="mt-3 flex items-center gap-2">
            <div className="border-border/15 bg-surface flex flex-1 items-center gap-2 rounded-xl border px-3">
              <Search className="text-muted/60 h-4 w-4" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search threads…"
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
          ) : filteredThreads.length === 0 ? (
            <p className="text-muted p-6 text-center text-xs">No threads match your search.</p>
          ) : (
            <div className="space-y-1">
              {filteredThreads.map((t) => (
                <ThreadRow
                  key={t.id}
                  thread={t}
                  isActive={t.id === activeThreadId}
                  onClick={() => setActiveThreadId(t.id)}
                />
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Right pane: conversation */}
      <section className="flex min-w-0 flex-1 flex-col">
        {/* Conversation header */}
        <header className="border-border/10 flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            {consultant ? (
              <>
                <Avatar className="h-11 w-11">
                  <AvatarFallback>{consultant.avatarInitials}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-text text-sm font-semibold">{consultant.name}</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="text-muted/70 text-[11px]">Your consultant</span>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-muted text-sm">No thread selected</p>
            )}
          </div>

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Video call">
              <Video className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Voice call">
              <Phone className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="More">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Message list */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
          {loading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <Card className="max-w-md">
                <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                  <span className="bg-accent/15 text-accent flex h-12 w-12 items-center justify-center rounded-2xl">
                    <MessageCircle className="h-5 w-5" />
                  </span>
                  <p className="font-display text-text text-lg">
                    Welcome{user ? `, ${user.name.split(' ')[0]}` : ''}
                  </p>
                  <p className="text-muted text-sm">
                    {consultant?.name ?? 'Your consultant'} is here to guide you through every
                    detail. Send a message any time.
                  </p>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-5">
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
                      const showAvatar =
                        !prev || prev.authorRole !== m.authorRole || prev.authorId !== m.authorId
                      return (
                        <div key={m.id} className="space-y-1">
                          <Bubble m={m} showAvatar={showAvatar} />
                          {m.id === lastClientMessageId && m.authorRole === 'client' && m.read && (
                            <p className="text-muted/70 pr-1 text-right text-[10px]">
                              Seen {relativeTime(m.createdAt)}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </AnimatePresence>

              {isTyping && consultant && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-2"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-[10px]">
                      {consultant.avatarInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="bg-surface-2 text-muted flex items-center gap-1 rounded-2xl rounded-bl-md px-4 py-2.5 text-xs">
                    <span>{consultant.name.split(' ')[0]} is typing</span>
                    <span className="flex gap-0.5">
                      <span className="bg-muted/60 h-1 w-1 animate-bounce rounded-full" />
                      <span
                        className="bg-muted/60 h-1 w-1 animate-bounce rounded-full"
                        style={{ animationDelay: '0.15s' }}
                      />
                      <span
                        className="bg-muted/60 h-1 w-1 animate-bounce rounded-full"
                        style={{ animationDelay: '0.3s' }}
                      />
                    </span>
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-border/10 sticky bottom-0 border-t bg-surface px-6 py-4">
          <div className="border-border/15 bg-surface mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border p-2">
            <Button variant="ghost" size="icon" aria-label="Attach file" type="button">
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Emoji" type="button">
              <Smile className="h-4 w-4" />
            </Button>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="Write a message…"
              className="text-text placeholder:text-muted/60 min-h-[40px] flex-1 resize-none border-0 bg-transparent px-2 py-2 text-sm leading-5 outline-none"
            />
            <Button
              onClick={handleSend}
              disabled={!draft.trim()}
              size="icon"
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-muted/60 mx-auto mt-2 max-w-3xl text-[10px]">
            <kbd className="border-border/15 rounded border px-1">Enter</kbd> to send ·{' '}
            <kbd className="border-border/15 rounded border px-1">Shift + Enter</kbd> for a new line
          </p>
        </div>
      </section>
    </div>
  )
}

