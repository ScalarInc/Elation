import type { InquiryDto, PublicInquiryBody } from '@elation/shared/api'
import type { Config } from '../../config'
import type { Inquiry, InquiryStatus, User } from '../../generated/prisma/client'
import { eventTypeFromDb, eventTypeToDb } from '../../lib/enums'
import { AppError } from '../../lib/errors'
import type { Mailer } from '../../lib/mailer'
import type { Db } from '../../plugins/db'
import { audit } from './audit'
import { inviteClient } from './invites'

type Actor = Pick<User, 'id' | 'role'>

/**
 * Public "Book a consultation" form → inquiries inbox → client invite (docs/step-12-admin.md).
 * Inquiries are unassigned leads: every consultant sees them and can pick one up (P55).
 */

function toDto(i: Inquiry): InquiryDto {
  return {
    id: i.id,
    name: i.name,
    email: i.email,
    phone: i.phone,
    eventType: i.eventType ? eventTypeFromDb(i.eventType) : null,
    eventDate: i.eventDate?.toISOString().slice(0, 10) ?? null,
    guestRange: i.guestRange,
    city: i.city,
    budgetBand: i.budgetBand,
    source: i.source,
    message: i.message,
    status: i.status.toLowerCase() as InquiryDto['status'],
    convertedUserId: i.convertedUserId,
    createdAt: i.createdAt.toISOString(),
  }
}

/** Returns false for bots (honeypot filled): they get the same "thanks" and nothing is stored. */
export async function submitInquiry(db: Db, body: PublicInquiryBody) {
  if (body.website) return false
  await db.inquiry.create({
    data: {
      name: body.name,
      email: body.email,
      phone: body.phone || null,
      eventType: body.eventType ? eventTypeToDb(body.eventType) : null,
      eventDate: body.eventDate ? new Date(body.eventDate) : null,
      guestRange: body.guestRange ?? null,
      city: body.city || null,
      budgetBand: body.budgetBand || null,
      source: body.source || null,
      message: body.message || null,
    },
  })
  return true
}

export async function listInquiries(db: Db, status?: string) {
  const rows = await db.inquiry.findMany({
    where: status ? { status: status.toUpperCase() as InquiryStatus } : {},
    orderBy: { createdAt: 'desc' },
    take: 300,
  })
  return rows.map(toDto)
}

async function load(db: Db, id: string) {
  const i = /^[0-9a-f-]{36}$/i.test(id) ? await db.inquiry.findUnique({ where: { id } }) : null
  if (!i) throw new AppError('INQUIRY_NOT_FOUND', 404, 'Inquiry not found')
  return i
}

export async function updateInquiry(db: Db, actor: Actor, id: string, status: 'new' | 'contacted' | 'closed', meta: { ip?: string }) {
  const i = await load(db, id)
  if (i.status === 'CONVERTED') throw new AppError('ALREADY_CONVERTED', 422, 'This inquiry is already a client')
  const next = status.toUpperCase() as InquiryStatus
  const updated = await db.$transaction(async (tx) => {
    const u = await tx.inquiry.update({ where: { id }, data: { status: next } })
    await audit(tx, actor, 'inquiry.status', 'Inquiry', id, { before: { status: i.status }, after: { status: next }, ip: meta.ip })
    return u
  })
  return toDto(updated)
}

/** Invites the person behind the inquiry (and a first draft event when they gave a type). */
export async function convertInquiry(
  deps: { db: Db; config: Config; mailer: Mailer; log?: { warn: (o: object, m: string) => void } },
  actor: Actor,
  id: string,
  body: { consultantId?: string; accessDays?: number },
  meta: { ip?: string },
) {
  const i = await load(deps.db, id)
  // Claimed first: two staff converting at once can't create two clients or two draft events.
  const claimed = await deps.db.inquiry.updateMany({ where: { id, status: { not: 'CONVERTED' } }, data: { status: 'CONVERTED' } })
  if (claimed.count === 0) throw new AppError('ALREADY_CONVERTED', 422, 'This inquiry is already a client')
  let invite
  try {
    invite = await inviteClient(deps, actor, { name: i.name, email: i.email, phone: i.phone ?? undefined, consultantId: body.consultantId, accessDays: body.accessDays }, meta)
  } catch (err) {
    await deps.db.inquiry.update({ where: { id }, data: { status: i.status } })
    throw err
  }
  await deps.db.$transaction(async (tx) => {
    if (i.eventType && (await tx.event.count({ where: { clientId: invite.userId } })) === 0) {
      await tx.event.create({
        data: { clientId: invite.userId, name: eventTypeFromDb(i.eventType), type: i.eventType, date: i.eventDate, venueCity: i.city, status: 'DRAFT' },
      })
    }
    await tx.inquiry.update({ where: { id }, data: { convertedUserId: invite.userId } })
    await audit(tx, actor, 'inquiry.convert', 'Inquiry', id, { after: { userId: invite.userId }, ip: meta.ip })
  })
  return { ...invite, inquiry: toDto(await load(deps.db, id)) }
}
