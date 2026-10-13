import 'dotenv/config'
import { z } from 'zod'

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v)
const optionalString = z.preprocess(emptyToUndefined, z.string().optional())

const base = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().url(),
  // Direct (session-mode) connection for realtime LISTEN, when DATABASE_URL goes through a pooler.
  DATABASE_LISTEN_URL: optionalString,

  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  SESSION_COOKIE_DOMAIN: optionalString,
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(14),
  DEFAULT_CLIENT_ACCESS_DAYS: z.coerce.number().int().positive().default(90),
  EXPIRED_DATA_RETENTION_DAYS: z.coerce.number().int().positive().default(7),

  // Public URL of the web app, used in email links (invites, password resets).
  APP_URL: z.string().url().default('http://localhost:5173'),

  // Email. Without RESEND_API_KEY, emails are written to the log instead of sent.
  RESEND_API_KEY: optionalString,
  MAIL_FROM: z.string().default('Elation X <onboarding@resend.dev>'),

  // Login throttling (per email and per IP, over 15 minutes).
  LOGIN_MAX_PER_EMAIL: z.coerce.number().int().positive().default(10),
  LOGIN_MAX_PER_IP: z.coerce.number().int().positive().default(30),

  // File storage (docs/step-11-files.md). With R2 credentials: Cloudflare R2 (or any
  // S3-compatible store via R2_ENDPOINT, e.g. MinIO). Without: files on local disk,
  // served through signed API links — development and tests only.
  R2_ACCOUNT_ID: optionalString,
  R2_ENDPOINT: optionalString,
  R2_ACCESS_KEY_ID: optionalString,
  R2_SECRET_ACCESS_KEY: optionalString,
  R2_PRIVATE_BUCKET: z.string().default('elation-private'),
  R2_PUBLIC_BUCKET: z.string().default('elation-public'),
  // CDN origin of the public bucket (r2.dev or a custom domain).
  R2_PUBLIC_BASE_URL: optionalString,
  STORAGE_LOCAL_DIR: z.string().default('.storage'),
  // Signs local-storage links; any long random string.
  STORAGE_SIGNING_SECRET: z.string().min(16).default('dev-only-storage-signing-secret'),

  // Absolute or server-relative path to the built webapp (webapp/dist).
  // Set in production so one Railway service serves both web and API.
  SERVE_WEBAPP_DIST: optionalString,
})

const schema = base.superRefine((c, ctx) => {
  if (c.NODE_ENV === 'production' && !c.R2_ACCESS_KEY_ID) {
    ctx.addIssue({ code: 'custom', path: ['R2_ACCESS_KEY_ID'], message: 'File storage (R2) is required in production' })
  }
  if (c.NODE_ENV === 'production' && !c.R2_PUBLIC_BASE_URL) {
    ctx.addIssue({ code: 'custom', path: ['R2_PUBLIC_BASE_URL'], message: 'Set the public bucket URL (CDN) in production' })
  }
  if (c.R2_ACCESS_KEY_ID && (!c.R2_SECRET_ACCESS_KEY || !(c.R2_ENDPOINT || c.R2_ACCOUNT_ID))) {
    ctx.addIssue({ code: 'custom', path: ['R2_SECRET_ACCESS_KEY'], message: 'Set R2_SECRET_ACCESS_KEY and R2_ACCOUNT_ID (or R2_ENDPOINT)' })
  }
})

export type Config = z.infer<typeof schema>

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(`Invalid environment configuration:\n${issues}`)
  }
  return parsed.data
}
