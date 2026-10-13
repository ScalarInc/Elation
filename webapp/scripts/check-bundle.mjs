// Fails when demo fixtures leak into a production build (docs/step-13-frontend-integration.md, P57).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const dist = join(root, 'dist')

// Markers come from the fixtures themselves: their ids (u_malaika, e_mehndi, t_ayesha…) and emails.
const fixtures = readFileSync(join(root, 'src', 'mocks', 'fixtures.ts'), 'utf8')
const markers = new Set([
  ...[...fixtures.matchAll(/\bid:\s*'([a-z]+_[\w-]+)'/g)].map((m) => m[1]),
  ...[...fixtures.matchAll(/'([\w.+-]+@[\w.-]+)'/g)].map((m) => m[1]),
])
if (markers.size < 10) throw new Error(`Only ${markers.size} fixture markers found — check the extraction`)

const files = []
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(js|mjs|css|html|map|json|txt)$/.test(name)) files.push(p)
  }
}
walk(dist)
if (!files.some((f) => f.endsWith('.js'))) throw new Error('No JavaScript in dist/ — run the build first')

const leaks = []
for (const file of files) {
  const text = readFileSync(file, 'utf8')
  for (const m of markers) if (text.includes(`"${m}"`) || text.includes(`'${m}'`) || text.includes(`\`${m}\``)) leaks.push(`${file.slice(dist.length + 1)}: ${m}`)
}
if (leaks.length) {
  console.error(`Demo data found in the build:\n  ${leaks.join('\n  ')}`)
  process.exit(1)
}
console.log(`Bundle check: ${files.length} files, ${markers.size} fixture markers, no demo data.`)
