import { createHash, randomBytes } from 'node:crypto'

/** 256-bit random token, URL-safe. Used for session cookies and reset links. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

/** Tokens are stored hashed so a database leak never yields usable cookies/links. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
