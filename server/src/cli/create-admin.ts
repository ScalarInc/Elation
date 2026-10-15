/**
 * Create the first admin on a fresh database (docs/step-14-deploy-ops.md, server/RUNBOOK.md).
 *
 *   Railway:  railway run --service elation-prod -- node dist/create-admin.js --email you@elationbyfmh.com --name "Your Name"
 *   Local:    npm run admin:create -w server -- --email you@example.com --name "Your Name"
 *
 * Prints a one-time activation link (valid 48 h). Open it, choose a password, done.
 */
import { parseArgs } from 'node:util'
import { loadConfig } from '../config'
import { AppError } from '../lib/errors'
import { bootstrapAdmin } from '../modules/admin/bootstrap'
import { createPrisma } from '../plugins/db'

const { values } = parseArgs({ options: { email: { type: 'string' }, name: { type: 'string' } } })
if (!values.email || !values.name) {
  console.error('Usage: create-admin --email <email> --name "<full name>"')
  process.exit(2)
}

const config = loadConfig()
const db = createPrisma(config.DATABASE_URL)
try {
  const { activationUrl, expiresAt } = await bootstrapAdmin(db, { email: values.email, name: values.name, appUrl: config.APP_URL })
  console.log(`\nAdmin invited: ${values.email}\nActivation link (one use, until ${expiresAt.toISOString()}):\n\n  ${activationUrl}\n`)
} catch (err) {
  console.error(err instanceof AppError ? `Not created: ${err.message}` : err)
  process.exitCode = 1
} finally {
  await db.$disconnect()
}
