import { Prisma } from '../../generated/prisma/client'
import { accessEndedEmail, accessEndingEmail, clientAccessEndedStaffEmail } from '../../lib/emails'
import type { Mailer } from '../../lib/mailer'
import type { Bucket, Storage } from '../../lib/storage'
import type { Db } from '../../plugins/db'
import { variantBucket } from '../files/service'

/**
 * Access-ending emails and the expired-client data purge (docs/step-14-deploy-ops.md,
 * owner answer A5). Both run from the hourly account sweep, after expiry.
 */

const DAY_MS = 24 * 60 * 60 * 1000

type Log = { warn: (o: object, m: string) => void; error: (o: object, m: string) => void }

/** When an expired client's data goes: `retentionDays` after access ended. */
export function dataDeletionDate(accessExpiresAt: Date, retentionDays: number) {
  return new Date(accessExpiresAt.getTime() + retentionDays * DAY_MS)
}

// ─────────────── Notices ───────────────

/** Which notice applies now: 7 = within a week, 1 = within a day, 0 = access ended. */
export function noticeStage(accessExpiresAt: Date, expired: boolean, now: Date): 7 | 1 | 0 | null {
  const left = accessExpiresAt.getTime() - now.getTime()
  if (expired || left <= 0) return 0
  if (left <= DAY_MS) return 1
  if (left <= 7 * DAY_MS) return 7
  return null
}

type NoticeDeps = { db: Db; mailer: Mailer; appUrl: string; retentionDays: number; log?: Log }

/**
 * Emails each client once per stage for the access window they're in: a week
 * before, a day before, and the day it ends (with the deletion date; their
 * consultant gets a copy so they can extend in time). Extending access moves
 * `accessExpiresAt`, so the notices start over for the new window.
 */
export async function sendAccessNotices(deps: NoticeDeps, now = new Date()): Promise<number> {
  const { db } = deps
  const candidates = await db.user.findMany({
    where: {
      role: 'CLIENT',
      OR: [
        { status: 'ACTIVE', accessExpiresAt: { gt: now, lte: new Date(now.getTime() + 7 * DAY_MS) } },
        // Ended, data not deleted yet (a notice after the purge would be pointless).
        { status: 'EXPIRED', accessExpiresAt: { gt: new Date(now.getTime() - deps.retentionDays * DAY_MS) } },
      ],
    },
    include: { consultant: { select: { name: true, email: true, status: true } } },
  })

  let sent = 0
  for (const u of candidates) {
    const expiresAt = u.accessExpiresAt!
    const stage = noticeStage(expiresAt, u.status === 'EXPIRED', now)
    if (stage === null) continue
    const sameWindow = u.accessNoticeFor?.getTime() === expiresAt.getTime()
    if (sameWindow && u.accessNoticeStage !== null && u.accessNoticeStage <= stage) continue

    // Claim the notice first: with two instances, only one sends it.
    const claimed = await db.user.updateMany({
      where: { id: u.id, accessNoticeFor: u.accessNoticeFor, accessNoticeStage: u.accessNoticeStage },
      data: { accessNoticeFor: expiresAt, accessNoticeStage: stage },
    })
    if (claimed.count === 0) continue

    const consultantName = u.consultant?.name ?? null
    try {
      if (stage === 0) {
        const deleteOn = dataDeletionDate(expiresAt, deps.retentionDays)
        await deps.mailer.send(accessEndedEmail({ to: u.email, name: u.name, deleteOn, consultantName }))
        if (u.consultant && u.consultant.status === 'ACTIVE') {
          await deps.mailer
            .send(
              clientAccessEndedStaffEmail({
                to: u.consultant.email,
                consultantName: u.consultant.name,
                clientName: u.name,
                deleteOn,
                url: `${deps.appUrl}/admin/clients/${u.id}`,
              }),
            )
            .catch((err: unknown) => deps.log?.warn({ err, userId: u.id }, 'access-ended email to consultant failed'))
        }
      } else {
        await deps.mailer.send(
          accessEndingEmail({ to: u.email, name: u.name, until: expiresAt, consultantName, retentionDays: deps.retentionDays, url: `${deps.appUrl}/dashboard` }),
        )
      }
      sent += 1
    } catch (err) {
      // Give the claim back so the next sweep tries again.
      await db.user.updateMany({
        where: { id: u.id, accessNoticeFor: expiresAt, accessNoticeStage: stage },
        data: { accessNoticeFor: u.accessNoticeFor, accessNoticeStage: u.accessNoticeStage },
      })
      deps.log?.warn({ err, userId: u.id, stage }, 'access notice email failed')
    }
  }
  return sent
}

// ─────────────── Purge ───────────────

type PurgeDeps = { db: Db; storage: Storage; retentionDays: number; log?: Log }

export type PurgeResult = { userId: string; events: number; files: number; threads: number }

/**
 * Deletes the data of clients whose access ended more than `retentionDays` ago
 * and who weren't extended since. What goes: events (questionnaire, moodboards,
 * budget, quotes, AR set, activity), chat threads, uploaded files and their
 * bytes, consultant notes, sessions, consents, invites and reset tokens. The
 * User row stays as an anonymised tombstone (`purgedAt`) so audit entries still
 * resolve; its email is freed, so the person can be invited again from scratch.
 * The audit trail keeps actions and dates but loses its before/after details.
 */
export async function purgeExpiredClients(deps: PurgeDeps, now = new Date()): Promise<PurgeResult[]> {
  const cutoff = new Date(now.getTime() - deps.retentionDays * DAY_MS)
  const due = await deps.db.user.findMany({
    where: { role: 'CLIENT', status: 'EXPIRED', purgedAt: null, accessExpiresAt: { lte: cutoff } },
    select: { id: true },
    take: 50,
  })
  const results: PurgeResult[] = []
  for (const { id } of due) {
    try {
      const r = await purgeClient(deps, id, cutoff, now)
      if (r) results.push(r)
    } catch (err) {
      deps.log?.error({ err, userId: id }, 'retention purge failed for client')
    }
  }
  return results
}

async function purgeClient(deps: PurgeDeps, userId: string, cutoff: Date, now: Date): Promise<PurgeResult | null> {
  const { db } = deps
  const purged = await db.$transaction(
    async (tx) => {
      // Same row lock as extendAccess: an extension and the purge can't interleave.
      const locked = await tx.$queryRaw<{ status: string; accessExpiresAt: Date | null; purgedAt: Date | null; role: string }[]>`
        SELECT "status", "accessExpiresAt", "purgedAt", "role" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`
      const u = locked[0]
      if (!u || u.role !== 'CLIENT' || u.status !== 'EXPIRED' || u.purgedAt || !u.accessExpiresAt || u.accessExpiresAt > cutoff) return null

      const events = await tx.event.findMany({ where: { clientId: userId, deletedAt: {} }, select: { id: true } })
      const eventIds = events.map((e) => e.id)
      const threads = await tx.thread.findMany({ where: { OR: [{ clientId: userId }, { eventId: { in: eventIds } }] }, select: { id: true } })
      const threadIds = threads.map((t) => t.id)
      const files = await tx.file.findMany({
        where: {
          deletedAt: {},
          OR: [{ ownerId: userId }, { eventId: { in: eventIds } }, { message: { threadId: { in: threadIds } } }],
        },
        select: { id: true, purpose: true, key: true, thumbKey: true, previewKey: true },
      })
      const fileIds = files.map((f) => f.id)

      await tx.moodboardTile.deleteMany({ where: { fileId: { in: fileIds } } })
      await tx.file.deleteMany({ where: { id: { in: fileIds } } })
      await tx.thread.deleteMany({ where: { id: { in: threadIds } } }) // participants + messages cascade
      await tx.aRSet.deleteMany({ where: { eventId: { in: eventIds } } }) // assets + notify-me cascade
      await tx.activityEntry.deleteMany({ where: { OR: [{ clientId: userId }, { eventId: { in: eventIds } }] } })
      await tx.consultantNote.deleteMany({ where: { clientId: userId } })
      // Questionnaire + revisions, moodboards + tiles, budget + lines + quotes cascade.
      await tx.event.deleteMany({ where: { id: { in: eventIds } } })
      await tx.session.deleteMany({ where: { userId } })
      await tx.consent.deleteMany({ where: { userId } })
      await tx.invite.deleteMany({ where: { userId } })
      await tx.passwordResetToken.deleteMany({ where: { userId } })
      await tx.aRNotifyRequest.deleteMany({ where: { userId } })
      await tx.threadParticipant.deleteMany({ where: { userId } })
      await tx.inquiry.updateMany({
        where: { convertedUserId: userId },
        data: { name: 'Former client', email: `purged-${userId}@purged.invalid`, phone: null, city: null, message: null, convertedUserId: null },
      })
      // Keep who-did-what-when; drop the details (names, emails, notes) they carried.
      await tx.auditLog.updateMany({
        where: { targetId: { in: [userId, ...eventIds, ...fileIds] } },
        data: { before: Prisma.DbNull, after: Prisma.DbNull },
      })
      await tx.user.update({
        where: { id: userId },
        data: {
          email: `purged-${userId}@purged.invalid`,
          name: 'Former client',
          passwordHash: null,
          phone: null,
          consultantId: null,
          avatarFileId: null,
          city: null,
          clientRole: null,
          partnerName: null,
          emergencyContactName: null,
          emergencyContactPhone: null,
          lastActiveAt: null,
          deletedAt: now,
          purgedAt: now,
        },
      })
      const counts = { events: eventIds.length, files: files.length, threads: threadIds.length }
      await tx.auditLog.create({ data: { action: 'user.purged', targetType: 'User', targetId: userId, after: counts } })
      return { files, counts }
    },
    { timeout: 60_000 },
  )
  if (!purged) return null

  // Bytes after the commit: a storage hiccup leaves an unreachable object, never a half-deleted account.
  for (const f of purged.files) {
    const keys: [Bucket, string | null][] = [
      ['private', f.key], // originals are always private (P46)
      [variantBucket(f), f.thumbKey],
      [variantBucket(f), f.previewKey],
    ]
    for (const [bucket, key] of keys) {
      if (!key) continue
      await deps.storage.delete(bucket, key).catch((err) => deps.log?.error({ err, bucket, key }, 'retention purge: could not delete stored file — remove it by hand'))
    }
  }
  return { userId, ...purged.counts }
}
