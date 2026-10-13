import { describe, expect, it } from 'vitest'
import { loadConfig } from '../config'
import { createStorage, signGrant, verifyGrant } from './storage'

describe('storage', () => {
  it('presigns R2 uploads and downloads without contacting R2', async () => {
    const config = loadConfig({
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      R2_ACCOUNT_ID: 'acct123',
      R2_ACCESS_KEY_ID: 'AKIATEST',
      R2_SECRET_ACCESS_KEY: 'secret',
      R2_PUBLIC_BASE_URL: 'https://media.elationx.example/',
    })
    const storage = createStorage(config)
    expect(storage.driver).toBe('s3')
    const put = await storage.presignPut('private', 'venue-media/u/f.jpg', { mime: 'image/jpeg', size: 1234, expiresIn: 300 })
    const url = new URL(put.url)
    expect(url.host).toBe('elation-private.acct123.r2.cloudflarestorage.com')
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300')
    expect(url.searchParams.get('X-Amz-SignedHeaders')?.split(';')).toEqual(expect.arrayContaining(['content-type', 'content-length', 'if-none-match']))
    expect(url.searchParams.has('x-amz-checksum-crc32')).toBe(false)
    expect(put.headers).toEqual({ 'Content-Type': 'image/jpeg', 'If-None-Match': '*' })
    const get = new URL(await storage.presignGet('private', 'venue-media/u/f.jpg', { expiresIn: 600, filename: 'Venue photo.jpg' }))
    expect(get.searchParams.get('response-content-disposition')).toContain('Venue photo.jpg')
    expect(storage.publicUrl('inventory-image/u/x.jpg')).toBe('https://media.elationx.example/inventory-image/u/x.jpg')
  })

  it('requires R2 in production', () => {
    expect(() => loadConfig({ DATABASE_URL: 'postgresql://u:p@localhost:5432/db', NODE_ENV: 'production' })).toThrow(/R2/)
  })

  it('rejects tampered and expired local links', () => {
    const token = signGrant('s'.repeat(16), { op: 'get', bucket: 'private', key: 'a/b', exp: Date.now() + 1000 })
    expect(verifyGrant('s'.repeat(16), token)).toMatchObject({ key: 'a/b' })
    expect(verifyGrant('t'.repeat(16), token)).toBeNull()
    expect(verifyGrant('s'.repeat(16), token, Date.now() + 2000)).toBeNull()
  })
})
