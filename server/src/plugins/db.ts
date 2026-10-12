import { PrismaPg } from '@prisma/adapter-pg'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { PrismaClient } from '../generated/prisma/client'

/** Models with a `deletedAt` column (docs/step-02-database.md). */
const SOFT_DELETE_MODELS = new Set(['User', 'Event', 'File'])

/** Read operations that hide soft-deleted rows unless the caller filters on deletedAt. */
const READ_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
])

/**
 * Prisma client with soft-delete filtering. Reads on User/Event/File add
 * `deletedAt: null` automatically. To see deleted rows (admin restore, audits)
 * pass an explicit `deletedAt` condition, e.g. `where: { deletedAt: { not: null } }`.
 * Relation includes are not filtered — services filter nested lists themselves.
 */
export function createPrisma(databaseUrl: string) {
  const base = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
  return base.$extends({
    name: 'softDelete',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (SOFT_DELETE_MODELS.has(model) && READ_OPERATIONS.has(operation)) {
            const a = args as { where?: Record<string, unknown> }
            if (a.where?.deletedAt === undefined) {
              a.where = { ...a.where, deletedAt: null }
            }
          }
          return query(args)
        },
      },
    },
  })
}

export type Db = ReturnType<typeof createPrisma>

/** The client handed to `db.$transaction(async (tx) => …)` callbacks. */
export type DbTx = Omit<Db, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends' | '$use'>

declare module 'fastify' {
  interface FastifyInstance {
    prisma: Db
  }
}

export default fp<{ databaseUrl: string }>(async function dbPlugin(app: FastifyInstance, opts) {
  const prisma = createPrisma(opts.databaseUrl)
  app.decorate('prisma', prisma)
  app.addHook('onClose', async () => {
    await prisma.$disconnect()
  })
})
