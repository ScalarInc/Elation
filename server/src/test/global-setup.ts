import 'dotenv/config'
import { execSync } from 'node:child_process'

/** Bring the test database up to the latest migration before any test runs. */
export default function setup() {
  const url = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL
  if (!url) throw new Error('Set DATABASE_URL_TEST (see server/.env.example)')
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: ['ignore', 'ignore', 'inherit'],
  })
}
