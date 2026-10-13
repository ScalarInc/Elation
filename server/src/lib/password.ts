import argon2 from 'argon2'
import { AppError } from './errors'

/**
 * A small deny-list of passwords that pass the length rule but are guessed
 * first. Not exhaustive — length (≥ 10) does most of the work.
 */
const COMMON_PASSWORDS = new Set([
  '1234567890',
  '0123456789',
  '123456789a',
  'qwertyuiop',
  'password12',
  'password123',
  'password1234',
  'iloveyou12',
  'elation123',
  'elationx123',
  'pakistan123',
  'islamabad123',
  'lahore12345',
  'karachi1234',
  'welcome123',
  'abcdefghij',
  'aaaaaaaaaa',
  'letmein123',
  'qwerty12345',
  '1q2w3e4r5t',
])

export function assertPasswordAllowed(password: string) {
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    throw new AppError('PASSWORD_TOO_COMMON', 400, 'That password is too common — choose another.')
  }
}

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id })
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password)
}

/**
 * Verify against a fixed hash when the account doesn't exist, so a wrong email
 * takes as long as a wrong password (no account enumeration by timing).
 */
let dummyHash: Promise<string> | undefined
export async function burnPasswordCheck(password: string) {
  dummyHash ??= hashPassword('not-a-real-account-password')
  await argon2.verify(await dummyHash, password)
}
