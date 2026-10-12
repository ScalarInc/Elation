import 'dotenv/config'
import { z } from 'zod'

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v)
const optionalString = z.preprocess(emptyToUndefined, z.string().optional())

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().url(),

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

  // Absolute or server-relative path to the built webapp (webapp/dist).
  // Set in production so one Railway service serves both web and API.
  SERVE_WEBAPP_DIST: optionalString,
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
