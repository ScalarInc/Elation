// Post-deploy smoke test (docs/step-14-deploy-ops.md).
//   node scripts/smoke.mjs https://elation-staging.up.railway.app
// With SMOKE_EMAIL + SMOKE_PASSWORD it also signs in and reads that account's events.
// Read-only: it never changes data (sign-in updates lastActiveAt, nothing else).
const base = (process.argv[2] ?? process.env.SMOKE_URL ?? '').replace(/\/$/, '')
if (!/^https?:\/\//.test(base)) {
  console.error('Usage: node scripts/smoke.mjs <base-url>   (or set SMOKE_URL)')
  process.exit(2)
}
const expectedRelease = process.env.SMOKE_EXPECT_RELEASE // e.g. the commit being deployed

let failed = 0
async function check(name, fn) {
  const started = Date.now()
  try {
    const note = await fn()
    console.log(`  ok   ${name} (${Date.now() - started} ms)${note ? ` — ${note}` : ''}`)
  } catch (err) {
    failed += 1
    console.log(`  FAIL ${name}: ${err.message}`)
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg)
}
const get = (path, init) => fetch(`${base}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(15_000), ...init })

console.log(`Smoke test against ${base}`)

await check('API is up (healthz)', async () => {
  const res = await get('/api/v1/healthz')
  assert(res.status === 200, `status ${res.status}`)
})

await check('database reachable (readyz)', async () => {
  const res = await get('/api/v1/readyz')
  const body = await res.json().catch(() => ({}))
  assert(res.status === 200 && body.checks?.database === 'up', `status ${res.status} ${JSON.stringify(body)}`)
})

await check('web app served with security headers', async () => {
  const res = await get('/', { headers: { accept: 'text/html' } })
  assert(res.status === 200, `status ${res.status}`)
  const html = await res.text()
  assert(html.includes('<div id="root">'), 'index.html not returned')
  const csp = res.headers.get('content-security-policy') ?? ''
  assert(csp.includes("script-src 'self'"), 'no Content-Security-Policy')
  assert(res.headers.get('x-content-type-options') === 'nosniff', 'no X-Content-Type-Options')
  if (base.startsWith('https://')) assert(res.headers.get('strict-transport-security'), 'no HSTS')
})

await check('client-side routes fall back to the app', async () => {
  const res = await get('/events/smoke-test', { headers: { accept: 'text/html' } })
  assert(res.status === 200 && (await res.text()).includes('<div id="root">'), `status ${res.status}`)
})

await check('API refuses signed-out callers', async () => {
  const res = await get('/api/v1/events')
  assert(res.status === 401, `expected 401, got ${res.status}`)
})

await check('release', async () => {
  const res = await get('/api/v1/client-config')
  const body = await res.json()
  if (expectedRelease) assert(expectedRelease.startsWith(body.release ?? '-'), `running ${body.release}, expected ${expectedRelease}`)
  return `${body.environment} ${body.release ?? '(no release tag)'}`
})

if (process.env.SMOKE_EMAIL && process.env.SMOKE_PASSWORD) {
  await check('sign in and read events', async () => {
    const login = await get('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: base },
      body: JSON.stringify({ email: process.env.SMOKE_EMAIL, password: process.env.SMOKE_PASSWORD, remember: false }),
    })
    assert(login.status === 200, `login status ${login.status}`)
    const cookie = (login.headers.getSetCookie?.() ?? [login.headers.get('set-cookie')]).map((c) => c?.split(';')[0]).filter(Boolean).join('; ')
    const events = await get('/api/v1/events', { headers: { cookie } })
    assert(events.status === 200, `events status ${events.status}`)
    const list = await events.json()
    await get('/api/v1/auth/logout', { method: 'POST', headers: { cookie, origin: base } })
    return `${list.length} event(s)`
  })
} else {
  console.log('  skip sign-in (set SMOKE_EMAIL and SMOKE_PASSWORD)')
}

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll checks passed')
