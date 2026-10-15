import { API_MODE, apiFetch } from '@/lib/api/client'

/**
 * Browser error reporting (docs/step-14-deploy-ops.md). The server says whether
 * Sentry is on (GET /client-config); only then is the SDK downloaded, so a
 * deploy without SENTRY_WEB_DSN ships and loads none of it. Nothing personal is
 * sent: no user, no URLs' query strings, no request data; emails and phone
 * numbers in messages are masked.
 */

type Sentry = typeof import('@sentry/browser')
type ClientConfig = { sentryDsn: string | null; environment: string; release: string | null }

let sentry: Sentry | null = null
const pending: unknown[] = []

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g
const PHONE = /\+?\d[\d\s-]{7,}\d/g
export const scrubText = (s: string) => s.replace(EMAIL, '[email]').replace(PHONE, '[phone]')
/** Paths keep their shape; query strings (reset tokens, invite codes, signed links) go. */
export const scrubUrl = (u: string) => u.split(/[?#]/)[0].replace(/(\/auth\/invite\/)[^/]+/, '$1[redacted]')

export async function initMonitoring() {
  if (API_MODE === 'mock') return
  let config: ClientConfig
  try {
    config = await apiFetch<ClientConfig>('/client-config')
  } catch {
    return // monitoring must never get in the way of the app
  }
  if (!config.sentryDsn) return
  const s = await import('@sentry/browser')
  s.init({
    dsn: config.sentryDsn,
    environment: config.environment,
    release: config.release ?? undefined,
    tracesSampleRate: 0,
    // No click/typing breadcrumbs (DOM text can be personal); console breadcrumbs dropped below.
    integrations: (defaults) => defaults.filter((i) => i.name !== 'Breadcrumbs').concat(s.breadcrumbsIntegration({ dom: false })),
    beforeSend(event) {
      delete event.user
      if (event.request) event.request = { url: event.request.url ? scrubUrl(event.request.url) : undefined }
      if (event.message) event.message = scrubText(event.message)
      for (const ex of event.exception?.values ?? []) if (ex.value) ex.value = scrubText(ex.value)
      return event
    },
    beforeBreadcrumb(b) {
      if (b.category === 'console') return null
      if (b.data?.url) b.data = { ...b.data, url: scrubUrl(String(b.data.url)) }
      if (b.data?.from) b.data = { ...b.data, from: scrubUrl(String(b.data.from)), to: scrubUrl(String(b.data.to ?? '')) }
      return b
    },
  })
  sentry = s
  for (const err of pending.splice(0)) s.captureException(err)
}

/** Report a crash the app caught itself (error boundary). */
export function reportError(err: unknown) {
  if (sentry) sentry.captureException(err)
  else if (pending.length < 10) pending.push(err) // reported once the SDK is up (if it comes up)
}
