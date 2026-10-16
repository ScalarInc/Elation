import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { adminApi } from '@/api/admin'
import { ChatThread } from '@/components/messages/ChatThread'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Spinner } from '@/components/ui/spinner'
import { useMessageThread } from '@/hooks/useMessageThread'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { AdminSummary, Conversation } from '@/types/admin'

function shortTime(iso: string) {
  const d = new Date(iso)
  const sameDay = d.toDateString() === new Date().toDateString()
  return new Intl.DateTimeFormat('en-GB', sameDay ? { hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: 'short' }).format(d)
}

/** Admin inbox: every client thread, updated live, with a reply pane. */
export function AdminMessagesPage() {
  const [conversations, setConversations] = useState<Conversation[] | null>(null)
  const [admins, setAdmins] = useState<AdminSummary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const loadInbox = useCallback(async () => {
    const [rows, adminRows] = await Promise.all([adminApi.messages.conversations(), adminApi.admins.list()])
    setConversations(rows)
    setAdmins(adminRows)
  }, [])

  useEffect(() => {
    void loadInbox().catch(() => setConversations([]))
    // Any new message anywhere: refresh the list so it re-orders and shows the latest line.
    const channel = supabase
      .channel('admin-inbox')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => void loadInbox())
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [loadInbox])

  const selectedId = activeId ?? conversations?.[0]?.clientId ?? null
  const active = conversations?.find((c) => c.clientId === selectedId) ?? null
  const adminNames = useMemo(() => new Map(admins.map((a) => [a.id, a.name])), [admins])

  const nameFor = useCallback(
    ({ senderId, senderRole }: { senderId: string | null; senderRole: 'client' | 'admin' }) =>
      senderRole === 'client' ? (active?.clientName ?? 'Client') : (senderId && adminNames.get(senderId)) || 'Elation',
    [active, adminNames],
  )
  const load = useCallback((before?: string) => adminApi.messages.list(selectedId!, before), [selectedId])
  const send = useCallback((body: string) => adminApi.messages.send(selectedId!, body), [selectedId])
  const thread = useMessageThread({ clientId: selectedId ?? undefined, load, send, nameFor })

  const q = query.trim().toLowerCase()
  const visible = (conversations ?? []).filter(
    (c) => !q || c.clientName.toLowerCase().includes(q) || c.clientEmail.toLowerCase().includes(q),
  )

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="border-border/10 flex w-80 shrink-0 flex-col border-r">
        <div className="border-border/10 border-b p-5">
          <h1 className="font-display text-text text-2xl">Messages</h1>
          <label className="border-border/15 bg-surface mt-3 flex items-center gap-2 rounded-xl border px-3 py-2">
            <Search className="text-muted/60 h-4 w-4" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search clients…"
              className="text-text placeholder:text-muted/50 w-full bg-transparent text-sm outline-none"
            />
          </label>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {conversations === null ? (
            <div className="flex justify-center p-6"><Spinner /></div>
          ) : visible.length === 0 ? (
            <p className="text-muted p-6 text-center text-xs">{conversations.length === 0 ? 'No clients yet.' : 'No clients match.'}</p>
          ) : (
            visible.map((c) => (
              <button
                key={c.clientId}
                type="button"
                onClick={() => setActiveId(c.clientId)}
                className={cn(
                  'hover:bg-surface-2 flex w-full items-start gap-3 rounded-2xl p-3 text-left transition',
                  c.clientId === selectedId && 'bg-surface-2 border-l-accent border-l-2',
                )}
              >
                <Avatar className="h-10 w-10">
                  <AvatarFallback>{c.avatarInitials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-text truncate text-sm font-semibold">{c.clientName}</p>
                    {c.lastMessage && <span className="text-muted/70 shrink-0 text-[10px]">{shortTime(c.lastMessage.createdAt)}</span>}
                  </div>
                  <p className="text-muted mt-0.5 truncate text-xs">
                    {c.lastMessage
                      ? `${c.lastMessage.senderRole === 'admin' ? 'You: ' : ''}${c.lastMessage.body}`
                      : 'No messages yet'}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {active ? (
        <ChatThread
          viewer="admin"
          {...thread}
          onLoadOlder={thread.loadOlder}
          onSend={thread.sendMessage}
          onRetry={() => void thread.reload()}
          header={
            <div className="flex items-center gap-3">
              <Avatar className="h-11 w-11">
                <AvatarFallback>{active.avatarInitials}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-text text-sm font-semibold">{active.clientName}</p>
                <p className="text-muted/70 text-[11px]">{active.clientEmail}</p>
              </div>
            </div>
          }
          emptyTitle="No messages yet"
          emptyBody={`Start the conversation with ${active.clientName.split(' ')[0]}.`}
        />
      ) : (
        <div className="text-muted flex flex-1 items-center justify-center text-sm">
          {conversations?.length ? 'Choose a conversation.' : 'Invite a client to start messaging.'}
        </div>
      )}
    </div>
  )
}
