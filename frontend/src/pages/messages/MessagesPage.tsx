import { useCallback } from 'react'
import { api } from '@/api'
import { ChatThread } from '@/components/messages/ChatThread'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useMessageThread } from '@/hooks/useMessageThread'

/** The client's single, live conversation with their Elation consultant team. */
export function MessagesPage() {
  const user = useCurrentUser()
  const consultant = user?.consultant ?? null

  const nameFor = useCallback(
    ({ senderId, senderRole }: { senderId: string | null; senderRole: 'client' | 'admin' }) => {
      if (senderRole === 'client') return user?.name ?? 'You'
      return senderId && senderId === consultant?.id ? consultant.name : 'Elation'
    },
    [user, consultant],
  )

  const thread = useMessageThread({
    clientId: user?.id,
    load: api.messages.list,
    send: api.messages.send,
    nameFor,
  })

  return (
    <div className="flex h-[calc(100vh-73px)] overflow-hidden">
      <ChatThread
        viewer="client"
        {...thread}
        onLoadOlder={thread.loadOlder}
        onSend={thread.sendMessage}
        onRetry={() => void thread.reload()}
        header={
          <div className="flex items-center gap-3">
            <Avatar className="h-11 w-11">
              <AvatarFallback>{consultant?.avatarInitials ?? 'EX'}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-text text-sm font-semibold">{consultant?.name ?? 'Elation team'}</p>
              <p className="text-muted/70 text-[11px]">Your consultant · replies appear here instantly</p>
            </div>
          </div>
        }
        emptyTitle={`Welcome${user ? `, ${user.name.split(' ')[0]}` : ''}`}
        emptyBody="Ask anything about your events, moodboards or budget. Your consultant will reply right here."
      />
    </div>
  )
}
