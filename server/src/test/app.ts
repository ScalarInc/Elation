import { buildApp } from '../app'
import { loadConfig } from '../config'

/**
 * Builds an app instance against the test database.
 * DATABASE_URL_TEST wins over DATABASE_URL so a local `.env` never points
 * tests at the dev database by accident.
 */
export async function buildTestApp(overrides: Record<string, string> = {}) {
  const databaseUrl = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL
  const config = loadConfig({
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    ...overrides,
  })
  const app = await buildApp(config)
  await app.ready()
  return app
}
