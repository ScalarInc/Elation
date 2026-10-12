import { describe, expect, it } from 'vitest'
import { loadConfig } from './config'

describe('loadConfig', () => {
  const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' }

  it('applies defaults', () => {
    const config = loadConfig(base)
    expect(config).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4000,
      DEFAULT_CLIENT_ACCESS_DAYS: 90,
      EXPIRED_DATA_RETENTION_DAYS: 7,
    })
    expect(config.SERVE_WEBAPP_DIST).toBeUndefined()
  })

  it('treats empty strings as unset', () => {
    expect(loadConfig({ ...base, SERVE_WEBAPP_DIST: '' }).SERVE_WEBAPP_DIST).toBeUndefined()
  })

  it('fails fast with a readable message when DATABASE_URL is missing', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/)
  })
})
