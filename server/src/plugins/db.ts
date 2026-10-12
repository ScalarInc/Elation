import { PrismaPg } from '@prisma/adapter-pg'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { PrismaClient } from '../generated/prisma/client'

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
  }
}

export function createPrisma(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
}

export default fp<{ databaseUrl: string }>(async function dbPlugin(app: FastifyInstance, opts) {
  const prisma = createPrisma(opts.databaseUrl)
  app.decorate('prisma', prisma)
  app.addHook('onClose', async () => {
    await prisma.$disconnect()
  })
})
