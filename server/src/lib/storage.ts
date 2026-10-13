import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { mkdir, open, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Config } from '../config'

/**
 * Object storage (docs/step-11-files.md, P11 / P42).
 * - R2 (or any S3-compatible store): the browser PUTs straight to the bucket
 *   with a presigned URL; the API never carries upload bytes.
 * - Local disk (development and tests, no credentials): the same flow, with
 *   HMAC-signed links served by the API itself.
 */

export type Bucket = 'private' | 'public'

export type Storage = {
  readonly driver: 's3' | 'local'
  /** Signed PUT for one object of exactly this type and size. */
  presignPut(bucket: Bucket, key: string, opts: { mime: string; size: number; expiresIn: number }): Promise<{ url: string; headers: Record<string, string> }>
  /** Signed GET (private) — `filename` makes browsers download with that name. */
  presignGet(bucket: Bucket, key: string, opts: { expiresIn: number; filename?: string }): Promise<string>
  /** CDN URL of a public object. */
  publicUrl(key: string): string
  head(bucket: Bucket, key: string): Promise<{ size: number; mime: string | null } | null>
  /** The first `bytes` bytes (type sniffing). */
  getStart(bucket: Bucket, key: string, bytes: number): Promise<Buffer>
  get(bucket: Bucket, key: string): Promise<Buffer>
  put(bucket: Bucket, key: string, body: Buffer, mime: string): Promise<void>
  delete(bucket: Bucket, key: string): Promise<void>
}

// ─────────────── S3 / R2 ───────────────

function s3Storage(config: Config): Storage {
  const endpoint = config.R2_ENDPOINT ?? `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
  const client = new S3Client({
    region: 'auto',
    endpoint,
    forcePathStyle: Boolean(config.R2_ENDPOINT), // MinIO and friends
    credentials: { accessKeyId: config.R2_ACCESS_KEY_ID!, secretAccessKey: config.R2_SECRET_ACCESS_KEY! },
    // Browsers can't send the SDK's default checksum headers on a presigned PUT.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })
  const name = (b: Bucket) => (b === 'public' ? config.R2_PUBLIC_BUCKET : config.R2_PRIVATE_BUCKET)
  return {
    driver: 's3',
    async presignPut(bucket, key, { mime, size, expiresIn }) {
      // Signed: type, exact size, and "only if nothing is there yet" — the link can't
      // overwrite the object after it was completed (P43).
      const cmd = new PutObjectCommand({ Bucket: name(bucket), Key: key, ContentType: mime, ContentLength: size, IfNoneMatch: '*' })
      const url = await getSignedUrl(client, cmd, { expiresIn, signableHeaders: new Set(['content-type', 'content-length', 'if-none-match']) })
      return { url, headers: { 'Content-Type': mime, 'If-None-Match': '*' } }
    },
    async presignGet(bucket, key, { expiresIn, filename }) {
      const cmd = new GetObjectCommand({
        Bucket: name(bucket),
        Key: key,
        ResponseContentDisposition: filename ? contentDisposition(filename) : undefined,
      })
      return getSignedUrl(client, cmd, { expiresIn })
    },
    publicUrl: (key) => `${(config.R2_PUBLIC_BASE_URL ?? '').replace(/\/$/, '')}/${key}`,
    async head(bucket, key) {
      try {
        const res = await client.send(new HeadObjectCommand({ Bucket: name(bucket), Key: key }))
        return { size: res.ContentLength ?? 0, mime: res.ContentType ?? null }
      } catch (err) {
        if ((err as { name?: string }).name === 'NotFound' || (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null
        throw err
      }
    },
    async getStart(bucket, key, bytes) {
      const res = await client.send(new GetObjectCommand({ Bucket: name(bucket), Key: key, Range: `bytes=0-${bytes - 1}` }))
      return Buffer.from(await res.Body!.transformToByteArray())
    },
    async get(bucket, key) {
      const res = await client.send(new GetObjectCommand({ Bucket: name(bucket), Key: key }))
      return Buffer.from(await res.Body!.transformToByteArray())
    },
    async put(bucket, key, body, mime) {
      await client.send(new PutObjectCommand({ Bucket: name(bucket), Key: key, Body: body, ContentType: mime }))
    },
    async delete(bucket, key) {
      await client.send(new DeleteObjectCommand({ Bucket: name(bucket), Key: key }))
    },
  }
}

export function contentDisposition(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

// ─────────────── Local disk ───────────────

/** What a signed local link allows. */
export type LocalGrant =
  | { op: 'put'; bucket: Bucket; key: string; mime: string; size: number; exp: number }
  | { op: 'get'; bucket: Bucket; key: string; exp: number; filename?: string }

export const LOCAL_ROUTE = '/api/v1/storage/local'

export function signGrant(secret: string, grant: LocalGrant) {
  const body = Buffer.from(JSON.stringify(grant)).toString('base64url')
  const sig = createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifyGrant(secret: string, token: string, now = Date.now()): LocalGrant | null {
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = createHmac('sha256', secret).update(body).digest()
  const given = Buffer.from(sig, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  const grant = JSON.parse(Buffer.from(body, 'base64url').toString()) as LocalGrant
  return grant.exp > now ? grant : null
}

export function localStorage(config: Pick<Config, 'STORAGE_LOCAL_DIR' | 'STORAGE_SIGNING_SECRET'>): Storage & { pathFor(bucket: Bucket, key: string): string } {
  const root = path.resolve(config.STORAGE_LOCAL_DIR)
  const pathFor = (bucket: Bucket, key: string) => {
    const p = path.resolve(root, bucket, key)
    if (!p.startsWith(path.join(root, bucket) + path.sep)) throw new Error('Bad storage key')
    return p
  }
  const meta = (p: string) => `${p}.meta.json`
  // In the query string: Fastify caps path parameters at 100 characters.
  const sign = (grant: LocalGrant) => `${LOCAL_ROUTE}?t=${signGrant(config.STORAGE_SIGNING_SECRET, grant)}`
  return {
    driver: 'local',
    pathFor,
    async presignPut(bucket, key, { mime, size, expiresIn }) {
      return { url: sign({ op: 'put', bucket, key, mime, size, exp: Date.now() + expiresIn * 1000 }), headers: { 'Content-Type': mime, 'If-None-Match': '*' } }
    },
    async presignGet(bucket, key, { expiresIn, filename }) {
      return sign({ op: 'get', bucket, key, filename, exp: Date.now() + expiresIn * 1000 })
    },
    publicUrl: (key) => sign({ op: 'get', bucket: 'public', key, exp: Number.MAX_SAFE_INTEGER }),
    async head(bucket, key) {
      try {
        const p = pathFor(bucket, key)
        const [s, m] = await Promise.all([stat(p), readFile(meta(p), 'utf8').catch(() => '{}')])
        return { size: s.size, mime: (JSON.parse(m) as { mime?: string }).mime ?? null }
      } catch {
        return null
      }
    },
    async getStart(bucket, key, bytes) {
      const handle = await open(pathFor(bucket, key), 'r')
      try {
        const buf = Buffer.alloc(bytes)
        const { bytesRead } = await handle.read(buf, 0, bytes, 0)
        return buf.subarray(0, bytesRead)
      } finally {
        await handle.close()
      }
    },
    get: (bucket, key) => readFile(pathFor(bucket, key)),
    async put(bucket, key, body, mime) {
      const p = pathFor(bucket, key)
      await mkdir(path.dirname(p), { recursive: true })
      await writeFile(p, body)
      await writeFile(meta(p), JSON.stringify({ mime }))
    },
    async delete(bucket, key) {
      const p = pathFor(bucket, key)
      await Promise.all([rm(p, { force: true }), rm(meta(p), { force: true })])
    },
  }
}

export function createStorage(config: Config): Storage {
  return config.R2_ACCESS_KEY_ID ? s3Storage(config) : localStorage(config)
}
