import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { tenantDb } from '@/server/db/tenant-client'
import { biometricSettingsSchema, type BiometricSettings } from './schema'

const NS = 'biometric'
const KEY = 'settings'

const DEFAULTS: BiometricSettings = biometricSettingsSchema.parse({})

export async function loadBiometricSettings(tenantId: string): Promise<BiometricSettings> {
  const db = tenantDb(tenantId)
  const row = await db.setting.findFirst({
    where: { namespace: NS, key: KEY },
    select: { value: true },
  })
  if (!row?.value || typeof row.value !== 'object') return DEFAULTS
  const parsed = biometricSettingsSchema.safeParse(row.value)
  return parsed.success ? parsed.data : DEFAULTS
}

export async function getBiometricSettings(ctx: AppContext) {
  ctx.require('biometric.view')
  return loadBiometricSettings(ctx.tenant.id)
}

export async function saveBiometricSettings(ctx: AppContext, input: unknown) {
  ctx.require('biometric.manage')
  const data = biometricSettingsSchema.parse(input)
  await ctx.db.setting.upsert({
    where: {
      tenantId_namespace_key: {
        tenantId: ctx.tenant.id,
        namespace: NS,
        key: KEY,
      },
    },
    create: {
      tenantId: ctx.tenant.id,
      namespace: NS,
      key: KEY,
      value: data,
    },
    update: { value: data },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'biometric.settings.update',
    module: 'biometric',
    summary: 'Updated biometric attendance settings',
    after: data,
  })

  return data
}
