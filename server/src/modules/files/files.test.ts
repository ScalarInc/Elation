import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp } from '../../test/app'
import { resetDb } from '../../test/db'
import { createUser, TEST_PASSWORD } from '../../test/users'
import { SESSION_COOKIE } from '../auth/sessions'
import { PENDING_TTL_MS, sweepPendingUploads } from './service'

type TestApp = Awaited<ReturnType<typeof buildTestApp>>
let app: TestApp

beforeAll(async () => {
  app = await buildTestApp({ LOGIN_MAX_PER_IP: '1000' })
})
afterAll(async () => {
  await app.close()
})
beforeEach(async () => {
  await resetDb(app.prisma)
})

type Cookies = Record<string, string>

async function signIn(email: string): Promise<Cookies> {
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password: TEST_PASSWORD } })
  return { [SESSION_COOKIE]: res.cookies.find((c) => c.name === SESSION_COOKIE)!.value }
}

const get = (url: string, cookies: Cookies = {}) => app.inject({ method: 'GET', url: url.startsWith('/api') ? url : `/api/v1${url}`, cookies })
const post = (url: string, cookies: Cookies, payload: object = {}) => app.inject({ method: 'POST', url: `/api/v1${url}`, cookies, payload })

async function setup() {
  const consultant = await createUser(app.prisma, { role: 'CONSULTANT' })
  const client = await createUser(app.prisma, { consultantId: consultant.id, name: 'Malaika Khan' })
  const [asClient, asConsultant] = await Promise.all([signIn(client.email), signIn(consultant.email)])
  const event = (
    await post('/events', asClient, { type: 'Mehndi', concept: 'Whispers of Noor', date: '2027-03-14', guests: 250, venueName: 'Lawn', city: 'Lahore', venueSetting: 'Outdoor' })
  ).json()
  return { client, consultant, asClient, asConsultant, eventId: event.id as string }
}

/** A phone-style photo: EXIF with a GPS position. */
function photoWithGps() {
  return sharp({ create: { width: 2400, height: 1800, channels: 3, background: '#E3BFB9' } })
    .jpeg()
    .withExif({ IFD0: { Make: 'PhoneCo', Model: 'Phone 15' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '31/1 31/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '74/1 21/1 0/1' } })
    .toBuffer()
}

/** Changes one signature character (not the last, which can be padding bits). */
const tamper = (url: string) => {
  const i = url.length - 6
  return url.slice(0, i) + (url[i] === 'A' ? 'B' : 'A') + url.slice(i + 1)
}

/** presign → PUT to the signed link → complete. */
async function upload(cookies: Cookies, body: Buffer, opts: { purpose?: string; mime?: string; filename?: string; eventId?: string; questionId?: string }) {
  const presign = await post('/files/presign', cookies, {
    purpose: opts.purpose ?? 'venue-media',
    filename: opts.filename ?? 'venue.jpg',
    mime: opts.mime ?? 'image/jpeg',
    size: body.length,
    eventId: opts.eventId,
    questionId: opts.questionId,
  })
  if (presign.statusCode !== 201) return { presign }
  const { fileId, uploadUrl, headers } = presign.json()
  const put = await app.inject({ method: 'PUT', url: uploadUrl, headers, payload: body })
  const complete = await post(`/files/${fileId}/complete`, cookies)
  return { presign, put, complete, fileId: fileId as string }
}

describe('uploads', () => {
  it('stores a venue photo, strips its location data and lists it on the event', async () => {
    const { asClient, asConsultant, eventId } = await setup()
    const original = await photoWithGps()
    expect((await sharp(original).metadata()).exif).toBeDefined()

    const { put, complete, fileId } = await upload(asClient, original, { eventId, questionId: 'q8_upload' })
    expect(put!.statusCode).toBe(200)
    expect(complete!.statusCode, complete!.body).toBe(200)
    const dto = complete!.json()
    expect(dto).toMatchObject({ id: fileId, status: 'ready', width: 2400, height: 1800, purpose: 'venue-media', questionId: 'q8_upload' })

    // What the UI shows has no EXIF (no GPS) and is resized.
    const preview = await get(dto.url)
    expect(preview.statusCode).toBe(200)
    expect(preview.headers['content-type']).toBe('image/webp')
    const meta = await sharp(preview.rawPayload).metadata()
    expect(meta.exif).toBeUndefined()
    expect(meta.width).toBe(1600)
    expect((await sharp((await get(dto.thumbUrl)).rawPayload).metadata()).width).toBe(400)

    const list = (await get(`/events/${eventId}/files`, asConsultant)).json()
    expect(list.map((f: { id: string }) => f.id)).toEqual([fileId])
    // Staff can download the untouched original.
    expect(list[0].downloadUrl).not.toBeNull()
  })

  it('keeps files private to the client, their consultant and admins', async () => {
    const { asClient, eventId } = await setup()
    const { fileId } = await upload(asClient, await photoWithGps(), { eventId })
    const other = await signIn((await createUser(app.prisma)).email)
    const stranger = await signIn((await createUser(app.prisma, { role: 'CONSULTANT' })).email)
    const admin = await signIn((await createUser(app.prisma, { role: 'ADMIN' })).email)
    expect((await get(`/files/${fileId}`, other)).statusCode).toBe(404)
    expect((await get(`/files/${fileId}`, stranger)).statusCode).toBe(404)
    expect((await get(`/events/${eventId}/files`, other)).statusCode).toBe(404)
    expect((await get(`/files/${fileId}`, admin)).statusCode).toBe(200)
  })

  it('refuses wrong types, oversized files, staff-only purposes and uploads that don’t match', async () => {
    const { asClient, eventId } = await setup()
    const bad = (body: object) => post('/files/presign', asClient, { purpose: 'venue-media', filename: 'x.jpg', mime: 'image/jpeg', size: 1000, eventId, ...body })
    expect((await bad({ mime: 'text/html', filename: 'x.html' })).statusCode).toBe(422)
    expect((await bad({ size: 16 * 1024 * 1024 })).statusCode).toBe(422)
    expect((await bad({ mime: 'video/mp4', filename: 'walkthrough.mp4', size: 150 * 1024 * 1024 })).statusCode).toBe(201)
    expect((await bad({ purpose: 'inventory-image' })).statusCode).toBe(403)
    expect((await bad({ eventId: undefined })).statusCode).toBe(422)

    // Announced 10 bytes, sent 5: the signed PUT refuses it.
    const presign = (await bad({ size: 10 })).json()
    const put = await app.inject({ method: 'PUT', url: presign.uploadUrl, headers: presign.headers, payload: Buffer.alloc(5) })
    expect(put.statusCode).toBe(422)
    expect((await post(`/files/${presign.fileId}/complete`, asClient)).statusCode).toBe(409)
    // A tampered link is refused.
    const tampered = await app.inject({ method: 'PUT', url: tamper(presign.uploadUrl), headers: presign.headers, payload: Buffer.alloc(10) })
    expect(tampered.statusCode).toBe(403)
  })

  it('shows PDFs as-is and lets only the uploader or staff delete; deleting clears questionnaire answers', async () => {
    const { asClient, asConsultant, eventId } = await setup()
    const pdf = Buffer.from('%PDF-1.4\n%fake floor plan\n')
    const { complete, fileId } = await upload(asClient, pdf, { eventId, mime: 'application/pdf', filename: 'floor plan.pdf', questionId: 'q8_upload' })
    expect(complete!.json()).toMatchObject({ thumbUrl: null, width: null })
    expect((await get(complete!.json().url)).rawPayload.equals(pdf)).toBe(true)
    const download = await get(complete!.json().downloadUrl)
    expect(download.headers['content-disposition']).toContain('floor plan.pdf')

    const q = (await get(`/events/${eventId}/questionnaire`, asClient)).json()
    await app.inject({ method: 'PATCH', url: `/api/v1/events/${eventId}/questionnaire`, cookies: asClient, payload: { version: q.version, set: { q8_upload: [fileId] } } })

    const other = await signIn((await createUser(app.prisma)).email)
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/files/${fileId}`, cookies: other })).statusCode).toBe(404)
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/files/${fileId}`, cookies: asConsultant })).statusCode).toBe(204)
    expect((await get(`/events/${eventId}/files`, asClient)).json()).toHaveLength(0)
    expect((await get(`/events/${eventId}/questionnaire`, asClient)).json().answers.q8_upload).toEqual([])
    expect((await get(complete!.json().url)).statusCode).toBe(404) // bytes gone
  })

  it('removes uploads that were never completed after a day', async () => {
    const { asClient, eventId } = await setup()
    const presign = (await post('/files/presign', asClient, { purpose: 'venue-media', filename: 'x.jpg', mime: 'image/jpeg', size: 10, eventId })).json()
    const deps = { db: app.prisma, storage: app.storage }
    expect(await sweepPendingUploads(deps)).toBe(0)
    expect(await sweepPendingUploads(deps, new Date(Date.now() + PENDING_TTL_MS + 1000))).toBe(1)
    expect(await app.prisma.file.findUnique({ where: { id: presign.fileId } })).toBeNull()
  })
})

describe('hardening', () => {
  it('refuses a renamed file, an SVG posing as a PNG, and replaying the upload link', async () => {
    const { asClient, eventId } = await setup()
    const fake = await upload(asClient, Buffer.from('<html><script>alert(1)</script></html>'), { eventId, mime: 'application/pdf', filename: 'plan.pdf' })
    expect(fake.complete!.statusCode).toBe(422)
    const svg = await upload(asClient, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), { eventId, mime: 'image/png', filename: 'x.png' })
    expect(svg.complete!.statusCode).toBe(422)

    const photo = await photoWithGps()
    const presign = (await post('/files/presign', asClient, { purpose: 'venue-media', filename: 'v.jpg', mime: 'image/jpeg', size: photo.length, eventId })).json()
    expect((await app.inject({ method: 'PUT', url: presign.uploadUrl, headers: presign.headers, payload: photo })).statusCode).toBe(200)
    expect((await post(`/files/${presign.fileId}/complete`, asClient)).statusCode).toBe(200)
    const replay = await app.inject({ method: 'PUT', url: presign.uploadUrl, headers: presign.headers, payload: Buffer.alloc(photo.length) })
    expect(replay.statusCode).toBe(412)
  })

  it("keeps Elation's catalogue media away from clients and originals out of the public bucket", async () => {
    const { asClient, asConsultant, eventId } = await setup()
    const render = await upload(asConsultant, await photoWithGps(), { purpose: 'ar-render', filename: 'render.jpg', eventId })
    expect(render.complete!.statusCode).toBe(200)
    expect((await get(`/files/${render.fileId}`, asClient)).statusCode).toBe(404)
    expect((await get(`/events/${eventId}/files`, asClient)).json()).toHaveLength(0)

    const row = await app.prisma.file.findUniqueOrThrow({ where: { id: render.fileId } })
    expect(row.bucket).toBe('private')
    expect(row.previewKey).not.toContain(row.key)
    // The public copy carries no location data.
    const pub = await get(render.complete!.json().url)
    expect((await sharp(pub.rawPayload).metadata()).exif).toBeUndefined()
  })

  it("won't let a questionnaire answer point at another event's file", async () => {
    const a = await setup()
    const { fileId } = await upload(a.asClient, await photoWithGps(), { eventId: a.eventId })
    const b = await setup()
    const q = (await get(`/events/${b.eventId}/questionnaire`, b.asClient)).json()
    const res = await app.inject({ method: 'PATCH', url: `/api/v1/events/${b.eventId}/questionnaire`, cookies: b.asClient, payload: { version: q.version, set: { q8_upload: [fileId] } } })
    expect(res.statusCode).toBe(422)
  })
})

describe('chat attachments', () => {
  it('sends a photo with a message; the other side sees a preview, others see nothing', async () => {
    const { asClient, asConsultant } = await setup()
    const [thread] = (await get('/threads', asClient)).json()
    const { fileId } = await upload(asClient, await photoWithGps(), { purpose: 'attachment', filename: 'mood.jpg' })
    const sent = await post(`/threads/${thread.id}/messages`, asClient, { body: '', attachmentFileIds: [fileId], clientMessageId: 'attach-test-1' })
    expect(sent.statusCode, sent.body).toBe(201)
    expect(sent.json().attachments).toEqual([expect.objectContaining({ id: fileId, filename: 'mood.jpg', thumbUrl: expect.any(String) })])

    const page = (await get(`/threads/${thread.id}/messages`, asConsultant)).json()
    expect(page.messages[0].attachments[0].id).toBe(fileId)
    expect((await get(`/files/${fileId}`, asConsultant)).statusCode).toBe(200)
    expect((await get(`/files/${fileId}`, await signIn((await createUser(app.prisma)).email))).statusCode).toBe(404)

    // A file can only be sent once, and only by its owner.
    const again = await post(`/threads/${thread.id}/messages`, asClient, { body: 'again', attachmentFileIds: [fileId], clientMessageId: 'attach-test-2' })
    expect(again.statusCode).toBe(422)
    // Empty message with no attachment is refused.
    expect((await post(`/threads/${thread.id}/messages`, asClient, { body: '', clientMessageId: 'attach-test-3' })).statusCode).toBe(400)
  })
})

describe('AR models', () => {
  it('gives a signed download link once a model file is attached to the asset', async () => {
    const { asClient, asConsultant, eventId } = await setup()
    const glb = Buffer.from('glTF fake model')
    const { fileId } = await upload(asConsultant, glb, { purpose: 'ar-model', mime: 'model/gltf-binary', filename: 'arch.glb' })
    const set = await app.prisma.aRSet.create({
      data: { eventId, eventType: 'MEHNDI', title: 'Set', theme: 'Noor', status: 'READY', coverUrl: '/c.jpg', summary: '', highlights: [] },
    })
    await app.prisma.aRAsset.create({ data: { setId: set.id, name: 'Arch', modelFileId: fileId } })
    const [asset] = (await get(`/ar-sets/${set.id}/assets`, asClient)).json()
    expect(asset.downloadUrl).toEqual(expect.any(String))
    expect((await get(asset.downloadUrl)).rawPayload.equals(glb)).toBe(true)
  })
})
