// Dependency audit for CI (docs/step-14-deploy-ops.md): fails on any high or
// critical advisory in production dependencies, except the ones listed below.
// Each exception says why it is accepted; review them on every Prisma upgrade.
import { execSync } from 'node:child_process'

const ACCEPTED = {
  // Prisma 7's CLI bundles its MySQL tooling and config loader. We only run the CLI for
  // `prisma migrate deploy` against Postgres; neither package is in the request path.
  'GHSA-ggr8-5vv4-36mx': 'deepmerge-ts via @prisma/config (Prisma CLI config loading only)',
  'GHSA-3f6p-5ww8-9rcr': 'mysql2 via prisma CLI (MySQL driver, never used — Postgres only)',
  'GHSA-rgwj-5xj2-c3m3': 'mysql2 via prisma CLI (MySQL driver, never used — Postgres only)',
}

let raw
try {
  raw = execSync('npm audit --omit=dev --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
} catch (err) {
  // npm audit exits non-zero when it finds anything; the JSON is still on stdout.
  raw = err.stdout
}
const report = JSON.parse(raw)
if (report.error) {
  console.error(`npm audit failed: ${report.error.summary ?? JSON.stringify(report.error)}`)
  process.exit(1)
}

const blocking = new Map()
const accepted = new Map()
for (const [pkg, v] of Object.entries(report.vulnerabilities ?? {})) {
  for (const via of v.via) {
    if (typeof via === 'string') continue // reported again under the package that has the advisory
    if (via.severity !== 'high' && via.severity !== 'critical') continue
    const id = via.url?.split('/').pop() ?? String(via.source)
    const line = `${id} ${via.severity} ${pkg}: ${via.title}`
    ;(ACCEPTED[id] ? accepted : blocking).set(id, ACCEPTED[id] ? `${line} — accepted: ${ACCEPTED[id]}` : line)
  }
}

for (const line of accepted.values()) console.log(`  ${line}`)
if (blocking.size) {
  console.error(`\nHigh/critical advisories in production dependencies:\n  ${[...blocking.values()].join('\n  ')}`)
  console.error('\nUpgrade the package, or add the advisory to ACCEPTED in scripts/audit.mjs with the reason.')
  process.exit(1)
}
console.log(`npm audit: no unaccepted high/critical advisories (${accepted.size} accepted).`)
