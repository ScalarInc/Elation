import { settingsSchema, type SettingsDto } from '@elation/shared/api'
import type { Prisma, User } from '../../generated/prisma/client'
import type { Config } from '../../config'
import type { Db } from '../../plugins/db'
import { audit } from './audit'

/** Admin settings (docs/step-12-admin.md). One `Setting` row per key; defaults come from config. */

export function defaultSettings(config: Pick<Config, 'DEFAULT_CLIENT_ACCESS_DAYS'>): SettingsDto {
  return { defaultAccessDays: config.DEFAULT_CLIENT_ACCESS_DAYS, consultantMaxExtendDays: 30, inviteIntro: '' }
}

export async function getSettings(db: Db, config: Pick<Config, 'DEFAULT_CLIENT_ACCESS_DAYS'>): Promise<SettingsDto> {
  const rows = await db.setting.findMany()
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  // A bad stored value falls back to the default rather than breaking every invite.
  const merged = { ...defaultSettings(config), ...stored }
  const parsed = settingsSchema.safeParse(merged)
  return parsed.success ? parsed.data : defaultSettings(config)
}

export async function updateSettings(
  db: Db,
  config: Pick<Config, 'DEFAULT_CLIENT_ACCESS_DAYS'>,
  actor: Pick<User, 'id'>,
  patch: Partial<SettingsDto>,
  meta: { ip?: string },
) {
  const before = await getSettings(db, config)
  await db.$transaction(async (tx) => {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue
      await tx.setting.upsert({
        where: { key },
        create: { key, value: value as Prisma.InputJsonValue, updatedById: actor.id },
        update: { value: value as Prisma.InputJsonValue, updatedById: actor.id },
      })
    }
    await audit(tx, actor, 'settings.update', 'Setting', 'settings', { before, after: { ...before, ...patch }, ip: meta.ip })
  })
  return getSettings(db, config)
}
