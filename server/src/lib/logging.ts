import type { FastifyServerOptions } from 'fastify'
import type { Config } from '../config'

/**
 * Logger options (docs/step-14-deploy-ops.md): JSON in staging/production for
 * Railway's log drain, pretty in development, silent in tests. Credentials,
 * contact details and one-time codes never reach the logs.
 */

/** Paths pino replaces with "[redacted]" wherever they appear in a log line's objects. */
export const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  // Contact details and secrets, at the top level or one object down ({ user: { email } }).
  // (Not `code` / `name`: error objects carry those and they matter when debugging.)
  ...['email', 'phone', 'password', 'passwordHash', 'token', 'to'].flatMap((k) => [k, `*.${k}`]),
]

/** Strip secrets from request URLs: signed storage links (?t=) and invite codes (/auth/invite/:code). */
export function redactUrl(url: string) {
  return url
    .replace(/([?&]t=)[^&]+/, '$1[redacted]')
    .replace(/(\/auth\/invite\/)(?!accept(?:[/?]|$))[^/?]+/, '$1[redacted]')
}

export async function loggerOptions(config: Pick<Config, 'NODE_ENV' | 'LOG_LEVEL'>): Promise<FastifyServerOptions['logger']> {
  if (config.NODE_ENV === 'test') return false
  // pino-pretty is a devDependency, so it is only imported in development.
  const stream =
    config.NODE_ENV === 'development'
      ? (await import('pino-pretty')).default({ translateTime: 'HH:MM:ss', ignore: 'pid,hostname' })
      : undefined
  return {
    level: config.LOG_LEVEL,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    serializers: {
      req: (req: { method: string; url: string; hostname?: string; ip?: string }) => ({
        method: req.method,
        url: redactUrl(req.url),
        host: req.hostname,
        remoteAddress: req.ip,
      }),
    },
    stream,
  }
}
