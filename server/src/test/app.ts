import os from 'node:os'
import path from 'node:path'
import { buildApp } from '../app'
import { loadConfig } from '../config'
import { MemoryMailer } from '../lib/mailer'

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
    // Uploads land in a throwaway folder, never the dev storage.
    STORAGE_LOCAL_DIR: path.join(os.tmpdir(), 'elation-test-storage'),
    R2_ACCESS_KEY_ID: '',
    ...overrides,
  })
  const mailer = new MemoryMailer()
  const app = await buildApp(config, { mailer })
  await app.ready()
  return Object.assign(app, { sentMail: mailer })
}
