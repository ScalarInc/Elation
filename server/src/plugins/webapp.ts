import path from 'node:path'
import fastifyStatic from '@fastify/static'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

/**
 * Serves the built webapp from the same origin as the API (production on
 * Railway — see docs/step-14-deploy-ops.md). The SPA fallback to index.html
 * lives in app.ts's not-found handler so there is only one of those.
 */
export default fp<{ root: string }>(async function webappPlugin(app: FastifyInstance, opts) {
  await app.register(fastifyStatic, {
    root: path.resolve(opts.root),
    wildcard: false,
    setHeaders(res, filePath) {
      // Vite emits content-hashed files under /assets; index.html must always revalidate.
      const hashed = filePath.includes(`${path.sep}assets${path.sep}`)
      res.header('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache')
    },
  })
})
