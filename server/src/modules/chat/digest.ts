import type { Config } from '../../config'
import { unreadMessagesEmail } from '../../lib/emails'
import type { Mailer } from '../../lib/mailer'
import type { Db } from '../../plugins/db'
import { accessProblem } from '../auth/access'

/**
 * Offline delivery (docs/step-10-chat-activity.md, P38): when someone has had
 * messages from others unread for 10 minutes and has no open socket, email one
 * digest. Each message is emailed about at most once (`lastEmailedMessageId`).
 * Presence is per API instance — right for the single Railway instance (P9);
 * share it through Postgres before running more than one.
 */

export const DIGEST_AFTER_MS = 10 * 60_000

type Pending = { threadId: string; userId: string; prevId: string | null; lastId: string; n: number; firstAt: Date }

export async function sendUnreadDigests(
  deps: {
    db: Db
    mailer: Mailer
    config: Pick<Config, 'APP_URL'>
    isOnline: (userId: string) => boolean
    onError?: (err: unknown, userId: string) => void
  },
  now = new Date(),
) {
  const { db } = deps
  const cutoff = new Date(now.getTime() - DIGEST_AFTER_MS)
  const pending = await db.$queryRaw<Pending[]>`
    SELECT tp."threadId", tp."userId", tp."lastEmailedMessageId" AS "prevId", max(m."id"::text)::uuid AS "lastId", count(*)::int AS n, min(m."createdAt") AS "firstAt"
    FROM "ThreadParticipant" tp
    JOIN "Message" m ON m."threadId" = tp."threadId"
    WHERE m."kind" = 'USER'
      AND m."deletedAt" IS NULL
      AND m."authorId" IS DISTINCT FROM tp."userId"
      AND (tp."lastReadMessageId" IS NULL OR m."id" > tp."lastReadMessageId")
      AND (tp."lastEmailedMessageId" IS NULL OR m."id" > tp."lastEmailedMessageId")
    GROUP BY tp."threadId", tp."userId", tp."lastEmailedMessageId"
    HAVING min(m."createdAt") <= ${cutoff}`
  if (pending.length === 0) return 0

  const byUser = new Map<string, Pending[]>()
  for (const p of pending) byUser.set(p.userId, [...(byUser.get(p.userId) ?? []), p])

  let sent = 0
  for (const [userId, rows] of byUser) {
    if (deps.isOnline(userId)) continue
    const user = await db.user.findUnique({ where: { id: userId } })
    if (!user || user.status !== 'ACTIVE' || accessProblem(user, now)) continue
    const prefs = user.notificationPrefs as { consultantMessages?: boolean } | null
    if (prefs?.consultantMessages === false) continue

    // Claim first: a second instance (or a slow tick) can't send the same digest.
    const claimed: Pending[] = []
    for (const r of rows) {
      const res = await db.$executeRaw`
        UPDATE "ThreadParticipant" SET "lastEmailedMessageId" = ${r.lastId}::uuid
        WHERE "threadId" = ${r.threadId}::uuid AND "userId" = ${userId}::uuid
          AND "lastEmailedMessageId" IS NOT DISTINCT FROM ${r.prevId}::uuid`
      if (res > 0) claimed.push(r)
    }
    if (claimed.length === 0) continue

    try {
      const threads = await Promise.all(
        claimed.map(async (r) => {
          const [thread, last] = await Promise.all([
            db.thread.findUniqueOrThrow({ where: { id: r.threadId } }),
            db.message.findUniqueOrThrow({ where: { id: r.lastId }, include: { author: { select: { name: true } } } }),
          ])
          const preview = last.body.length > 140 ? `${last.body.slice(0, 137)}…` : last.body
          return { title: thread.title, count: r.n, from: last.author?.name ?? 'Elation', preview }
        }),
      )
      const path = user.role === 'CLIENT' ? '/messages' : '/admin/messages'
      const thread = claimed.length === 1 ? `?thread=${claimed[0].threadId}` : ''
      await deps.mailer.send(unreadMessagesEmail({ to: user.email, name: user.name, threads, url: `${deps.config.APP_URL}${path}${thread}` }))
      sent += 1
    } catch (err) {
      // Release the claim so the next tick tries again.
      for (const r of claimed) {
        await db.threadParticipant.updateMany({
          where: { threadId: r.threadId, userId, lastEmailedMessageId: r.lastId },
          data: { lastEmailedMessageId: r.prevId },
        })
      }
      deps.onError?.(err, userId)
    }
  }
  return sent
}
