import type { NoteDto } from '@elation/shared/api'
import type { ConsultantNote, User } from '../../generated/prisma/client'
import { AppError } from '../../lib/errors'
import { assertClientAccess, assertEventAccess, clientScope } from '../../lib/policy'
import type { Db } from '../../plugins/db'
import { audit } from './audit'

type Actor = Pick<User, 'id' | 'role'>

/** Consultant notes & follow-ups (docs/step-12-admin.md). Internal: clients never see them (P50). */

export function toNoteDto(n: ConsultantNote & { author: { id: string; name: string }; client: { name: string } }): NoteDto {
  return {
    id: n.id,
    clientId: n.clientId,
    clientName: n.client.name,
    eventId: n.eventId,
    author: n.author,
    body: n.body,
    followUpAt: n.followUpAt?.toISOString().slice(0, 10) ?? null,
    doneAt: n.doneAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  }
}

const include = { author: { select: { id: true, name: true } }, client: { select: { name: true } } } as const
const day = (d: string) => new Date(`${d}T00:00:00.000Z`)

export async function listNotes(db: Db, actor: Actor, clientId: string) {
  await assertClientAccess(db, actor, clientId)
  const rows = await db.consultantNote.findMany({ where: { clientId }, orderBy: { createdAt: 'desc' }, include })
  return rows.map(toNoteDto)
}

export async function createNote(db: Db, actor: Actor, clientId: string, body: { body: string; eventId?: string; followUpAt?: string }, meta: { ip?: string }) {
  await assertClientAccess(db, actor, clientId)
  if (body.eventId) {
    const event = await assertEventAccess(db, actor, body.eventId)
    if (event.clientId !== clientId) throw new AppError('EVENT_NOT_FOUND', 404, 'Event not found')
  }
  const note = await db.$transaction(async (tx) => {
    const n = await tx.consultantNote.create({
      data: { clientId, authorId: actor.id, eventId: body.eventId ?? null, body: body.body, followUpAt: body.followUpAt ? day(body.followUpAt) : null },
      include,
    })
    await audit(tx, actor, 'note.create', 'User', clientId, { after: { noteId: n.id, followUpAt: body.followUpAt ?? null }, ip: meta.ip })
    return n
  })
  return toNoteDto(note)
}

export async function updateNote(db: Db, actor: Actor, noteId: string, body: { body?: string; followUpAt?: string | null; done?: boolean }, meta: { ip?: string } = {}) {
  const note = /^[0-9a-f-]{36}$/i.test(noteId) ? await db.consultantNote.findUnique({ where: { id: noteId } }) : null
  if (!note) throw new AppError('NOTE_NOT_FOUND', 404, 'Note not found')
  await assertClientAccess(db, actor, note.clientId).catch(() => {
    throw new AppError('NOTE_NOT_FOUND', 404, 'Note not found')
  })
  if (body.body !== undefined && note.authorId !== actor.id && actor.role !== 'ADMIN') {
    throw new AppError('FORBIDDEN', 403, 'Only the author can edit this note')
  }
  const updated = await db.$transaction(async (tx) => {
    const u = await tx.consultantNote.update({
      where: { id: noteId },
      data: {
        body: body.body,
        followUpAt: body.followUpAt === undefined ? undefined : body.followUpAt ? day(body.followUpAt) : null,
        doneAt: body.done === undefined ? undefined : body.done ? new Date() : null,
      },
      include,
    })
    await audit(tx, actor, 'note.update', 'User', note.clientId, {
      before: { noteId, followUpAt: note.followUpAt?.toISOString() ?? null, done: Boolean(note.doneAt), edited: false },
      after: { noteId, followUpAt: body.followUpAt, done: body.done, edited: body.body !== undefined },
      ip: meta.ip,
    })
    return u
  })
  return toNoteDto(updated)
}

/** The consultant's to-do list: open follow-ups, by due date. Admins see everyone's. */
export async function followUps(db: Db, actor: Actor, due: 'today' | 'overdue' | 'week' | 'all', now = new Date()) {
  const today = day(now.toISOString().slice(0, 10))
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000)
  const window =
    due === 'overdue'
      ? { lt: today }
      : due === 'today'
        ? { lt: tomorrow }
        : due === 'week'
          ? { lt: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000) }
          : { not: null }
  const rows = await db.consultantNote.findMany({
    where: { doneAt: null, followUpAt: window, client: clientScope(actor), ...(actor.role === 'CONSULTANT' ? { authorId: actor.id } : {}) },
    orderBy: { followUpAt: 'asc' },
    include,
    take: 100,
  })
  return rows.map(toNoteDto)
}
