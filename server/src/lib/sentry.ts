import * as Sentry from '@sentry/node'
import type { Config } from '../config'
import { redactUrl } from './logging'

/**
 * Error reporting for the API (docs/step-14-deploy-ops.md). Off unless SENTRY_DSN
 * is set. Errors are reported explicitly — 5xx from the error handler, failed
 * background sweeps, crashes — no tracing. Nothing personal leaves the server:
 * no IPs, cookies, headers, bodies or query strings, and emails/phones/tokens in
 * messages are masked (same rules as the logs).
 */

let enabled = false

export const releaseOf = (c: Pick<Config, 'RELEASE' | 'RAILWAY_GIT_COMMIT_SHA'>) => c.RELEASE ?? c.RAILWAY_GIT_COMMIT_SHA?.slice(0, 12)

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g
const PHONE = /\+?\d[\d\s-]{7,}\d/g
const SECRET_PARAM = /([?&](?:t|token|code)=)[^&\s]+/gi

export function scrubText(s: string) {
  return s.replace(EMAIL, '[email]').replace(SECRET_PARAM, '$1[redacted]').replace(PHONE, '[phone]')
}

/** Strips request details and masks contact details in an event before it is sent. */
export function scrubEvent<E extends Sentry.ErrorEvent>(event: E): E {
  delete event.user
  delete event.server_name
  if (event.request) {
    event.request = { method: event.request.method, url: event.request.url ? redactUrl(event.request.url.split('?')[0]) : undefined }
  }
  if (event.message) event.message = scrubText(event.message)
  for (const ex of event.exception?.values ?? []) if (ex.value) ex.value = scrubText(ex.value)
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((b) => ({ ...b, message: b.message ? scrubText(b.message) : b.message, data: undefined }))
  }
  if (event.extra) delete event.extra
  return event
}

export function initSentry(config: Config) {
  if (!config.SENTRY_DSN || config.NODE_ENV === 'test') return false
  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.SENTRY_ENVIRONMENT,
    release: releaseOf(config),
    // Collect nothing personal in the first place; beforeSend scrubs whatever slips through.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
    tracesSampleRate: 0,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (b) => (b.category === 'console' ? null : b),
  })
  enabled = true
  return true
}

/** Report an error with a little non-personal context (ids, route, job name). */
export function reportError(err: unknown, context: Record<string, string | number | undefined> = {}) {
  if (!enabled) return
  Sentry.withScope((scope) => {
    for (const [k, v] of Object.entries(context)) if (v !== undefined) scope.setTag(k, String(v))
    Sentry.captureException(err)
  })
}

export async function flushSentry() {
  if (enabled) await Sentry.close(2000)
}
