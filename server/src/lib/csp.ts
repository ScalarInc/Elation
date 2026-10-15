import type { Config } from '../config'

/**
 * Content-Security-Policy for the web app (docs/step-14-deploy-ops.md).
 * The SPA is served by this same server, so the policy follows from config:
 * scripts only from our origin; uploads, signed downloads and catalogue images
 * from the storage origins; Sentry's ingest host when browser errors are reported.
 */

type CspConfig = Pick<Config, 'APP_URL' | 'R2_ACCOUNT_ID' | 'R2_ENDPOINT' | 'R2_ACCESS_KEY_ID' | 'R2_PUBLIC_BASE_URL' | 'SENTRY_WEB_DSN' | 'NODE_ENV'>

const origin = (url: string | undefined) => {
  if (!url) return null
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/** Where the browser talks to object storage: presigned PUTs (uploads) and GETs (private photos, downloads). */
export function storageOrigins(c: CspConfig): string[] {
  const out: string[] = []
  if (c.R2_ACCESS_KEY_ID) {
    if (c.R2_ENDPOINT) {
      const o = origin(c.R2_ENDPOINT)
      if (o) out.push(o)
    } else if (c.R2_ACCOUNT_ID) {
      // The SDK signs virtual-hosted URLs: https://<bucket>.<account>.r2.cloudflarestorage.com
      out.push(`https://*.${c.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, `https://${c.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`)
    }
  }
  const pub = origin(c.R2_PUBLIC_BASE_URL)
  if (pub) out.push(pub)
  return [...new Set(out)]
}

export function cspDirectives(c: CspConfig): Record<string, string[]> {
  const storage = storageOrigins(c)
  const app = new URL(c.APP_URL)
  // 'self' covers same-origin websockets in current browsers; older Safari needs it spelled out.
  const socket = `${app.protocol === 'https:' ? 'wss' : 'ws'}://${app.host}`
  const sentry = origin(c.SENTRY_WEB_DSN)

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    'script-src-attr': ["'none'"],
    // Toasts and dialogs inject small <style> tags at runtime; Google Fonts serves the font CSS.
    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
    // Any https image: the inspiration CMS accepts pasted https links (admin.ts `url`).
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'media-src': ["'self'", 'blob:', ...storage],
    'connect-src': ["'self'", socket, ...storage, ...(sentry ? [sentry] : [])],
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
    'frame-src': ["'none'"],
    'manifest-src': ["'self'"],
  }
  if (c.NODE_ENV === 'production') directives['upgrade-insecure-requests'] = []
  return directives
}
