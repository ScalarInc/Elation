import { FILE_RULES, fileProblem, mimeFor, type FileDto, type FilePurposeDto, type PresignBody } from '@elation/shared/api'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import type { File, FilePurpose, Prisma, User } from '../../generated/prisma/client'
import { AppError } from '../../lib/errors'
import { assertEventAccess, assertThreadAccess } from '../../lib/policy'
import type { Bucket, Storage } from '../../lib/storage'
import type { Db } from '../../plugins/db'
import { patchQuestionnaire } from '../questionnaire/service'

type Actor = Pick<User, 'id' | 'role'>
type Log = { warn: (o: object, m: string) => void }
type Deps = { db: Db; storage: Storage; log?: Log }

/** Files & uploads (docs/step-11-files.md, P42–P45). */

const UPLOAD_TTL_S = 5 * 60
const VIEW_TTL_S = 10 * 60
export const PENDING_TTL_MS = 24 * 60 * 60 * 1000
/** Upload budget per person per day (pending uploads included), and files per event. */
export const DAILY_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024
export const FILES_PER_EVENT = 500
/** Decoding cap for photos (≈ 40 megapixels): a "decompression bomb" fails instead of eating memory. */
const MAX_PIXELS = 40_000_000

export const purposeToDb = (p: FilePurposeDto) => p.toUpperCase().replace(/-/g, '_') as FilePurpose
export const purposeFromDb = (p: FilePurpose) => p.toLowerCase().replace(/_/g, '-') as FilePurposeDto

const isStaff = (a: Actor) => a.role !== 'CLIENT'
const ruleOf = (f: Pick<File, 'purpose'>) => FILE_RULES[purposeFromDb(f.purpose)]
/** Originals always sit in the private bucket (they may carry location data). */
const ORIGINALS: Bucket = 'private'
/** Processed copies of catalogue media are public (CDN); everything else stays private. */
export const variantBucket = (f: Pick<File, 'purpose'>): Bucket => (ruleOf(f).public ? 'public' : 'private')
/** Photos get processed copies; everything else is shown as-is. */
const PROCESSABLE = new Set(['image/jpeg', 'image/png', 'image/webp'])

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'application/pdf': 'pdf',
  'model/gltf-binary': 'glb',
  'model/obj': 'obj',
  'application/zip': 'zip',
  'application/octet-stream': 'bin',
}

/** The first bytes each type must start with — a renamed file is refused. */
function matchesType(mime: string, head: Buffer) {
  const at = (offset: number, sig: string | number[]) => {
    const bytes = typeof sig === 'string' ? Buffer.from(sig, 'latin1') : Buffer.from(sig)
    return head.length >= offset + bytes.length && head.subarray(offset, offset + bytes.length).equals(bytes)
  }
  switch (mime) {
    case 'image/jpeg':
      return at(0, [0xff, 0xd8, 0xff])
    case 'image/png':
      return at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    case 'image/webp':
      return at(0, 'RIFF') && at(8, 'WEBP')
    case 'application/pdf':
      return at(0, '%PDF-')
    case 'video/mp4':
    case 'video/quicktime':
      return at(4, 'ftyp') || at(4, 'moov') || at(4, 'wide') || at(4, 'mdat')
    case 'model/gltf-binary':
      return at(0, 'glTF')
    case 'application/zip':
      return at(0, [0x50, 0x4b, 0x03, 0x04])
    case 'model/obj':
    case 'application/octet-stream':
      // OBJ is plain text: refuse anything that looks like markup or a binary.
      return !head.includes(0) && !/^\s*</.test(head.toString('latin1'))
    default:
      return false
  }
}

export async function presign(deps: Deps, actor: Actor, input: PresignBody) {
  const rule = FILE_RULES[input.purpose]
  if (rule.staffOnly && !isStaff(actor)) throw new AppError('FORBIDDEN', 403, 'Only the Elation team can upload these')
  const mime = mimeFor(input.filename, input.mime)
  const problem = fileProblem(input.purpose, mime, input.size)
  if (problem) throw new AppError('FILE_NOT_ALLOWED', 422, problem)

  let eventId: string | null = null
  if (input.eventId) eventId = (await assertEventAccess(deps.db, actor, input.eventId)).id
  if ((input.purpose === 'venue-media' || input.purpose === 'reference-image') && !eventId) {
    throw new AppError('EVENT_REQUIRED', 422, 'Choose which event this file is for')
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const [{ _sum }, onEvent] = await Promise.all([
    deps.db.file.aggregate({ where: { ownerId: actor.id, createdAt: { gte: since }, deletedAt: {} }, _sum: { sizeBytes: true } }),
    eventId ? deps.db.file.count({ where: { eventId } }) : Promise.resolve(0),
  ])
  if ((_sum.sizeBytes ?? 0) + input.size > DAILY_UPLOAD_BYTES) {
    throw new AppError('UPLOAD_QUOTA', 429, 'That’s a lot of uploads for one day — please continue tomorrow or ask your consultant')
  }
  if (onEvent >= FILES_PER_EVENT) throw new AppError('UPLOAD_QUOTA', 429, 'This event has reached its file limit — remove some files first')

  const key = `${input.purpose}/${actor.id}/${randomUUID()}.${EXT[mime] ?? 'bin'}`
  const file = await deps.db.file.create({
    data: {
      ownerId: actor.id,
      eventId,
      questionId: input.questionId ?? null,
      purpose: purposeToDb(input.purpose),
      bucket: ORIGINALS,
      key,
      filename: input.filename,
      mime,
      sizeBytes: input.size,
    },
  })
  const { url, headers } = await deps.storage.presignPut(ORIGINALS, key, { mime, size: input.size, expiresIn: UPLOAD_TTL_S })
  return { fileId: file.id, uploadUrl: url, headers }
}

/**
 * Who may see a file: its owner; admins; anyone who can see its event or the
 * conversation it was sent in; a consultant for their own clients' files and
 * for the team's catalogue media. Catalogue media (staff-only purposes) is
 * never listed to clients here — they get models through their AR set.
 * Others get 404 (P18).
 */
export async function assertFileAccess(db: Db, actor: Actor, id: string) {
  const file = /^[0-9a-f-]{36}$/i.test(id)
    ? await db.file.findUnique({ where: { id }, include: { owner: { select: { name: true, role: true, consultantId: true } }, message: true } })
    : null
  if (file) {
    const catalogue = ruleOf(file).staffOnly
    if (file.ownerId === actor.id || actor.role === 'ADMIN') return file
    if (actor.role === 'CLIENT' && catalogue) throw notFound()
    if (file.eventId && (await canSeeEvent(db, actor, file.eventId))) return file
    if (file.message && (await canSeeThread(db, actor, file.message.threadId))) return file
    if (actor.role === 'CONSULTANT' && (catalogue || (file.owner.role === 'CLIENT' && file.owner.consultantId === actor.id))) return file
  }
  throw notFound()
}

const notFound = () => new AppError('FILE_NOT_FOUND', 404, 'File not found')

const canSeeEvent = (db: Db, actor: Actor, eventId: string) =>
  assertEventAccess(db, actor, eventId).then(
    () => true,
    () => false,
  )
const canSeeThread = (db: Db, actor: Actor, threadId: string) =>
  assertThreadAccess(db, actor, threadId).then(
    () => true,
    () => false,
  )

/** Removes location and camera data and makes the two copies the UI shows. */
async function processPhoto(storage: Storage, file: File) {
  const original = await storage.get(ORIGINALS, file.key)
  // .rotate() applies the EXIF orientation; sharp drops all metadata from its output by default.
  const image = sharp(original, { failOn: 'error', limitInputPixels: MAX_PIXELS }).rotate()
  const { width, height, orientation } = await image.metadata()
  // EXIF orientations 5–8 are rotated a quarter turn: the shown photo swaps sides.
  const turned = (orientation ?? 1) >= 5
  const bucket = variantBucket(file)
  // Unrelated keys: a public preview never reveals where the original is.
  const written: string[] = []
  const variant = async (size: number) => {
    const buf = await image.clone().resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer()
    const key = `${file.key.split('/').slice(0, 2).join('/')}/${randomUUID()}.w${size}.webp`
    await storage.put(bucket, key, buf, 'image/webp')
    written.push(key)
    return key
  }
  try {
    const thumbKey = await variant(400)
    const previewKey = await variant(1600)
    return { thumbKey, previewKey, width: (turned ? height : width) ?? null, height: (turned ? width : height) ?? null }
  } catch (err) {
    for (const key of written) await storage.delete(bucket, key).catch(() => {})
    throw err
  }
}

export async function complete(deps: Deps, actor: Actor, id: string) {
  const file = await deps.db.file.findUnique({ where: { id } })
  if (!file || file.ownerId !== actor.id) throw notFound()
  if (file.status === 'READY') return toFileDto(deps, actor, await withOwner(deps.db, file.id))

  const reject = async (code: string, message: string) => {
    await deps.storage.delete(ORIGINALS, file.key)
    return new AppError(code, 422, message)
  }
  const head = await deps.storage.head(ORIGINALS, file.key)
  if (!head) throw new AppError('UPLOAD_MISSING', 409, 'The upload didn’t arrive — please try again')
  if (head.size !== file.sizeBytes || (head.mime && head.mime !== file.mime)) {
    throw await reject('UPLOAD_MISMATCH', 'The uploaded file doesn’t match what was announced')
  }
  if (!matchesType(file.mime, await deps.storage.getStart(ORIGINALS, file.key, 32))) {
    throw await reject('FILE_NOT_ALLOWED', 'This file isn’t really the type its name says')
  }

  let processed: Awaited<ReturnType<typeof processPhoto>> | null = null
  if (PROCESSABLE.has(file.mime)) {
    try {
      processed = await processPhoto(deps.storage, file)
    } catch (err) {
      deps.log?.warn({ err, fileId: file.id }, 'photo processing failed')
      throw await reject('FILE_NOT_READABLE', 'We couldn’t read this photo — try saving it as a JPEG and uploading again')
    }
  }
  try {
    await deps.db.file.update({ where: { id }, data: { status: 'READY', ...(processed ?? {}) } })
  } catch (err) {
    for (const key of [processed?.thumbKey, processed?.previewKey]) if (key) await deps.storage.delete(variantBucket(file), key).catch(() => {})
    throw err
  }
  return toFileDto(deps, actor, await withOwner(deps.db, file.id))
}

const withOwner = (db: Db, id: string) => db.file.findUniqueOrThrow({ where: { id }, include: { owner: { select: { name: true } } } })

export async function toFileDto(deps: Pick<Deps, 'storage'>, actor: Actor, f: File & { owner: { name: string } }): Promise<FileDto> {
  const vBucket = variantBucket(f)
  const variant = (key: string) => (vBucket === 'public' ? Promise.resolve(deps.storage.publicUrl(key)) : deps.storage.presignGet(vBucket, key, { expiresIn: VIEW_TTL_S }))
  const original = (filename?: string) => deps.storage.presignGet(ORIGINALS, f.key, { expiresIn: VIEW_TTL_S, filename })
  const ready = f.status === 'READY'
  const isPhoto = PROCESSABLE.has(f.mime)
  // Photo originals keep their location data: only Elation staff and the uploader get them.
  const mayDownloadOriginal = !isPhoto || isStaff(actor) || f.ownerId === actor.id
  return {
    id: f.id,
    purpose: purposeFromDb(f.purpose),
    filename: f.filename,
    mime: f.mime,
    sizeBytes: f.sizeBytes,
    width: f.width,
    height: f.height,
    status: ready ? 'ready' : 'pending',
    eventId: f.eventId,
    questionId: f.questionId,
    ownerName: f.owner.name,
    createdAt: f.createdAt.toISOString(),
    url: !ready ? null : f.previewKey ? await variant(f.previewKey) : isPhoto ? null : await original(),
    thumbUrl: ready && f.thumbKey ? await variant(f.thumbKey) : null,
    downloadUrl: ready && mayDownloadOriginal ? await original(f.filename) : null,
    canDelete: isStaff(actor) || (f.ownerId === actor.id && !f.messageId),
  }
}

export async function getFile(deps: Deps, actor: Actor, id: string) {
  const f = await assertFileAccess(deps.db, actor, id)
  return toFileDto(deps, actor, f)
}

const CATALOGUE: FilePurpose[] = (Object.keys(FILE_RULES) as FilePurposeDto[]).filter((p) => FILE_RULES[p].staffOnly).map(purposeToDb)

export async function listEventFiles(deps: Deps, actor: Actor, eventId: string, purpose?: FilePurposeDto) {
  await assertEventAccess(deps.db, actor, eventId)
  const where: Prisma.FileWhereInput = { eventId, status: 'READY' }
  if (purpose) where.purpose = purposeToDb(purpose)
  if (actor.role === 'CLIENT') where.NOT = { purpose: { in: CATALOGUE } }
  const rows = await deps.db.file.findMany({
    where,
    include: { owner: { select: { name: true } } },
    orderBy: { id: 'desc' },
  })
  return Promise.all(rows.map((f) => toFileDto(deps, actor, f)))
}

/**
 * Delete (owner or staff): the row is kept, soft-deleted, for the record; the
 * file leaves the moodboard tiles and questionnaire answers that pointed at
 * it; then the bytes are removed (a failure is logged — the row says what to retry).
 */
export async function deleteFile(deps: Deps, actor: Actor, id: string) {
  const f = await assertFileAccess(deps.db, actor, id)
  if (f.ownerId !== actor.id && !isStaff(actor)) throw new AppError('FORBIDDEN', 403, 'Only the person who uploaded this can remove it')
  if (f.messageId && !isStaff(actor)) throw new AppError('FILE_IN_MESSAGE', 422, 'Files sent in a message stay with the conversation')
  await deps.db.$transaction([
    deps.db.file.update({ where: { id }, data: { deletedAt: new Date() } }),
    deps.db.moodboardTile.deleteMany({ where: { fileId: id } }),
  ])
  if (f.eventId) {
    await dropFromAnswers(deps.db, actor, f.eventId, id).catch((err) => deps.log?.warn({ err, fileId: id }, 'could not clear the file from the questionnaire'))
  }
  const keys: [Bucket, string | null][] = [
    [ORIGINALS, f.key],
    [variantBucket(f), f.thumbKey],
    [variantBucket(f), f.previewKey],
  ]
  for (const [bucket, key] of keys) {
    if (key) await deps.storage.delete(bucket, key).catch((err) => deps.log?.warn({ err, fileId: id, key }, 'could not remove file bytes'))
  }
}

async function dropFromAnswers(db: Db, actor: Actor, eventId: string, fileId: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const q = await db.questionnaireResponse.findUnique({ where: { eventId } })
    const answers = (q?.answers ?? {}) as Record<string, unknown>
    const set: Record<string, unknown> = {}
    for (const [qid, value] of Object.entries(answers)) {
      if (Array.isArray(value) && value.includes(fileId)) set[qid] = value.filter((v) => v !== fileId)
    }
    if (!q || Object.keys(set).length === 0) return
    try {
      await patchQuestionnaire(db, actor, eventId, { version: q.version, set })
      return
    } catch (err) {
      if (err instanceof AppError && err.code === 'VERSION_CONFLICT') continue
      if (err instanceof AppError && err.code === 'EVENT_ARCHIVED') return
      throw err
    }
  }
}

/** Uploads that were never completed, and their bytes if any arrived. */
export async function sweepPendingUploads(deps: Deps, now = new Date()) {
  const stale = await deps.db.file.findMany({ where: { status: 'PENDING', createdAt: { lt: new Date(now.getTime() - PENDING_TTL_MS) } }, take: 500 })
  let removed = 0
  for (const f of stale) {
    // Only if it is still pending: a completion that landed meanwhile wins.
    const { count } = await deps.db.file.deleteMany({ where: { id: f.id, status: 'PENDING' } })
    if (count === 0) continue
    removed += 1
    await deps.storage.delete(ORIGINALS, f.key).catch(() => {})
  }
  return removed
}

/** Files a sender attaches to a message: theirs, uploaded, not sent before. */
export async function claimAttachments(db: Db, actor: Actor, fileIds: string[]) {
  const files = await db.file.findMany({ where: { id: { in: fileIds }, ownerId: actor.id, status: 'READY', purpose: 'ATTACHMENT', messageId: null } })
  if (files.length !== new Set(fileIds).size) throw new AppError('ATTACHMENT_INVALID', 422, 'One of the attachments isn’t available — upload it again')
  return files
}
