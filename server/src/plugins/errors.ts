import type { FastifyError, FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod'
import { AppError, type ErrorBody } from '../lib/errors'

/** Prisma error codes we translate instead of leaking as 500s. */
const PRISMA_NOT_FOUND = 'P2025'
const PRISMA_UNIQUE = 'P2002'

export function errorBody(code: string, message: string, details?: unknown): ErrorBody {
  return { error: details === undefined ? { code, message } : { code, message, details } }
}

export default fp(async function errorsPlugin(app: FastifyInstance) {
  app.setErrorHandler((err: FastifyError & { meta?: unknown }, request, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send(errorBody(err.code, err.message, err.details))
    }

    if (hasZodFastifySchemaValidationErrors(err)) {
      const details = err.validation.map((v) => ({ path: v.instancePath, message: v.message }))
      return reply.code(400).send(errorBody('VALIDATION_FAILED', 'Request validation failed', details))
    }

    if (err.code === PRISMA_NOT_FOUND) {
      return reply.code(404).send(errorBody('NOT_FOUND', 'Resource not found'))
    }
    if (err.code === PRISMA_UNIQUE) {
      return reply.code(409).send(errorBody('ALREADY_EXISTS', 'Resource already exists', err.meta))
    }

    // Fastify's own 4xx errors (bad JSON, payload too large, rate limit…)
    if (err.statusCode && err.statusCode < 500) {
      return reply.code(err.statusCode).send(errorBody(err.code ?? 'BAD_REQUEST', err.message))
    }

    request.log.error({ err }, 'Unhandled error')
    return reply.code(500).send(errorBody('INTERNAL', 'Something went wrong'))
  })
})
