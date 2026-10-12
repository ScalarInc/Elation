import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // `prisma generate` doesn't need a database, so don't fail when the URL is
    // absent (CI install step, Docker build). Migrate/studio still require it.
    url: process.env.DATABASE_URL ?? '',
  },
})
