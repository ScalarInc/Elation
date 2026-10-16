import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { MessageCircle, Send, WifiOff } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'
import { initialsOf } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { ConnectionState } from '@/hooks/useMessageThread'
import type { Message } from '@/types'

const MAX_LENGTH = 4000

function dateKey(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function dividerLabel(iso: string) {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (dateKey(iso) === dateKey(new Date().toISOString())) return 'Today'
  if (dateKey(iso) === dateKey(yesterday.toISOString())) return 'Yesterday'
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))
}

const timeOf = (iso: string) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

function groupByDay(list: Message[]) {
  const groups: { key: string; label: string; items: Message[] }[] = []
  for (const m of list) {
    const key = dateKey(m.createdAt)
    const last = groups[groups.length - 1]
    if (last?.key === key) last.items.push(m)
    else groups.push({ key, label: dividerLabel(m.createdAt), items: [m] })
  }
  return groups
}

/**
 * Message list + composer. `viewer` decides which side is "mine":
 * clients see their own messages on the right, admins see admin messages on the right.
 */
export function ChatThread({
  viewer,
  messages,
  loading,
  error,
  connection,
  hasMore,
  onLoadOlder,
  onSend,
  onRetry,
  header,
  emptyTitle,
  emptyBody,
}: {
  viewer: 'client' | 'admin'
  messages: Message[]
  loading: boolean
  error: string | null
  connection: ConnectionState
  hasMore: boolean
  onLoadOlder: () => Promise<void>
  onSend: (body: string) => Promise<void>
  onRetry: () => void
  header: ReactNode
  emptyTitle: string
  emptyBody: string
}) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const grouped = useMemo(() => groupByDay(messages), [messages])
  const newestId = messages[messages.length - 1]?.id

  // Stay pinned to the newest message.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [newestId])

  // Grow the composer up to ~6 lines.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`
  }, [draft])

  async function submit() {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    setDraft('')
    try {
      await onSend(body)
    } catch (err) {
      setDraft(body) // keep what they wrote
      toast.error('Message not sent', { description: (err as Error).message })
    } finally {
      setSending(false)
      textareaRef.current?.focus()
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void submit()
    }
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="border-border/10 flex items-center justify-between gap-3 border-b px-6 py-4">
        {header}
        {connection === 'offline' && (
          <span className="text-warning flex items-center gap-1.5 text-xs font-semibold">
            <WifiOff className="h-3.5 w-3.5" /> Reconnecting… new messages may be delayed
          </span>
        )}
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
        {loading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-text text-sm font-semibold">Couldn't load messages</p>
            <p className="text-muted text-xs">{error}</p>
            <Button variant="outline" size="sm" onClick={onRetry}>Try again</Button>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <span className="bg-accent/15 text-accent flex h-12 w-12 items-center justify-center rounded-2xl">
              <MessageCircle className="h-5 w-5" />
            </span>
            <p className="font-display text-text text-lg">{emptyTitle}</p>
            <p className="text-muted max-w-sm text-sm">{emptyBody}</p>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-5">
            {hasMore && (
              <div className="flex justify-center">
                <Button variant="ghost" size="sm" onClick={() => void onLoadOlder()}>Load earlier messages</Button>
              </div>
            )}
            {grouped.map((group) => (
              <div key={group.key} className="space-y-3">
                <div className="flex justify-center">
                  <span className="text-muted/70 bg-surface-2 rounded-full px-3 py-0.5 text-[10px] font-bold uppercase tracking-widest">
                    {group.label}
                  </span>
                </div>
                {group.items.map((m, idx) => {
                  const mine = m.senderRole === viewer
                  const prev = group.items[idx - 1]
                  const showName = !mine && (!prev || prev.senderId !== m.senderId)
                  return (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className={cn('flex items-end gap-2', mine ? 'justify-end' : 'justify-start')}
                    >
                      {!mine &&
                        (showName ? (
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-[10px]">{initialsOf(m.senderName)}</AvatarFallback>
                          </Avatar>
                        ) : (
                          <span className="w-8 shrink-0" aria-hidden />
                        ))}
                      <div
                        className={cn(
                          'max-w-[70%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm',
                          mine ? 'bg-blush/70 text-ink rounded-br-md' : 'bg-surface-2 text-text rounded-bl-md',
                        )}
                      >
                        {showName && <p className="text-muted mb-0.5 text-[11px] font-semibold">{m.senderName}</p>}
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        <p className={cn('mt-1 text-[10px]', mine ? 'text-ink/60 text-right' : 'text-muted/70')}>
                          {timeOf(m.createdAt)}
                        </p>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-border/10 bg-surface border-t px-6 py-4">
        <div className="border-border/15 bg-surface mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border p-2">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_LENGTH))}
            onKeyDown={onKeyDown}
            rows={1}
            disabled={loading || Boolean(error)}
            placeholder="Write a message…"
            aria-label="Message"
            className="text-text placeholder:text-muted/60 min-h-[40px] flex-1 resize-none border-0 bg-transparent px-2 py-2 text-sm leading-5 outline-none"
          />
          <Button onClick={() => void submit()} disabled={!draft.trim() || sending} size="icon" aria-label="Send message">
            {sending ? <Spinner /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-muted/60 mx-auto mt-2 max-w-3xl text-[10px]">
          <kbd className="border-border/15 rounded border px-1">Enter</kbd> to send ·{' '}
          <kbd className="border-border/15 rounded border px-1">Shift + Enter</kbd> for a new line
        </p>
      </div>
    </section>
  )
}
