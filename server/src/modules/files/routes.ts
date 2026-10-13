import { fileSchema, listEventFilesQuery, presignBody, presignResponse } from '@elation/shared/api'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { AppError } from '../../lib/errors'
import { rateLimit } from '../../lib/rate-limit'
import { LOCAL_ROUTE, contentDisposition, localStorage, verifyGrant } from '../../lib/storage'
import { currentUser } from '../../plugins/auth'
import * as files from './service'

const idParams = z.object({ id: z.string().max(64) })

/** Files & uploads (docs/step-11-files.md). */
export const fileRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.requireAuth)
  const deps = { db: app.prisma, storage: app.storage, log: app.log }

  app.post(
    '/files/presign',
    {
      schema: { body: presignBody, response: { 201: presignResponse } },
      preHandler: [rateLimit({ name: 'file-presign', max: 120, windowMs: 60 * 60 * 1000, key: (r) => currentUser(r).id })],
    },
    async (request, reply) => reply.code(201).send(await files.presign(deps, currentUser(request), request.body)),
  )

  app.post('/files/:id/complete', { schema: { params: idParams, response: { 200: fileSchema } } }, async (request) =>
    files.complete(deps, currentUser(request), request.params.id),
  )

  app.get('/files/:id', { schema: { params: idParams, response: { 200: fileSchema } } }, async (request) =>
    files.getFile(deps, currentUser(request), request.params.id),
  )

  app.delete('/files/:id', { schema: { params: idParams } }, async (request, reply) => {
    await files.deleteFile(deps, currentUser(request), request.params.id)
    return reply.code(204).send()
  })

  app.get(
    '/events/:id/files',
    { schema: { params: idParams, querystring: listEventFilesQuery, response: { 200: z.array(fileSchema) } } },
    async (request) => files.listEventFiles(deps, currentUser(request), request.params.id, request.query.purpose),
  )
}

/**
 * Local-disk storage endpoints (development and tests only): the stand-in for
 * the bucket. Access is the signed token in `?t=`, like a presigned URL.
 */
export const localStorageRoutes: FastifyPluginAsyncZod = async (app) => {
  if (app.storage.driver !== 'local') return
  const disk = localStorage(app.config)
  const secret = app.config.STORAGE_SIGNING_SECRET
  const prefix = LOCAL_ROUTE.replace('/api/v1', '')
  const querystring = z.object({ t: z.string().max(4096) })

  app.addContentTypeParser('*', { parseAs: 'buffer', bodyLimit: 300 * 1024 * 1024 }, (_req, body, done) => done(null, body))

  app.put(
    prefix,
    {
      schema: { querystring },
      bodyLimit: 300 * 1024 * 1024,
      // Checked before the body is read: a bad link never gets to upload 300 MB.
      onRequest: async (request) => {
        const grant = verifyGrant(secret, (request.query as { t?: string }).t ?? '')
        if (!grant || grant.op !== 'put') throw new AppError('SIGNATURE_INVALID', 403, 'This upload link is invalid or has expired')
        if (Number(request.headers['content-length'] ?? -1) !== grant.size) throw new AppError('UPLOAD_MISMATCH', 422, 'Size must match the signed size')
        if (request.headers['content-type'] !== grant.mime) throw new AppError('UPLOAD_MISMATCH', 422, 'Content-Type must match the signed type')
      },
    },
    async (request, reply) => {
      const grant = verifyGrant(secret, request.query.t)
      if (!grant || grant.op !== 'put') throw new AppError('SIGNATURE_INVALID', 403, 'This upload link is invalid or has expired')
      const body = request.body as Buffer
      if (!Buffer.isBuffer(body) || body.length !== grant.size) throw new AppError('UPLOAD_MISMATCH', 422, 'Size must match the signed size')
      // Like the signed If-None-Match on R2: a link can't replace what's already stored.
      if (await disk.head(grant.bucket, grant.key)) throw new AppError('ALREADY_UPLOADED', 412, 'This file was already uploaded')
      await disk.put(grant.bucket, grant.key, body, grant.mime)
      return reply.code(200).send()
    },
  )

  app.get(prefix, { schema: { querystring } }, async (request, reply) => {
    const grant = verifyGrant(secret, request.query.t)
    if (!grant || grant.op !== 'get') throw new AppError('SIGNATURE_INVALID', 403, 'This link is invalid or has expired')
    const head = await disk.head(grant.bucket, grant.key)
    if (!head) throw new AppError('FILE_NOT_FOUND', 404, 'File not found')
    reply.header('Content-Type', head.mime ?? 'application/octet-stream')
    reply.header('Cache-Control', 'private, max-age=600')
    reply.header('X-Content-Type-Options', 'nosniff')
    reply.header('Referrer-Policy', 'no-referrer')
    // Same origin as the app: only photos are shown inline; everything else downloads.
    if (grant.filename || !head.mime?.startsWith('image/')) reply.header('Content-Disposition', contentDisposition(grant.filename ?? 'file'))
    return reply.send(await disk.get(grant.bucket, grant.key))
  })
}
