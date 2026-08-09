import { cache } from 'react'
import { prisma } from '@/server/db/prisma'

/**
 * Feature keys. Modules are toggled per plan, limits are numeric.
 * Nothing in the product may hardcode a limit - always ask this service.
 */
export const FEATURE = {
  MODULE_TRANSPORT: 'module.transport',
  MODULE_LIBRARY: 'module.library',
  MODULE_INVENTORY: 'module.inventory',
  MODULE_SPORTS: 'module.sports',
  MODULE_EVENTS: 'module.events',
  MODULE_WEBSITE: 'module.website',
  MODULE_ADMISSIONS_CRM: 'module.admissions_crm',
  MODULE_CERTIFICATES: 'module.certificates',
  MODULE_FRONT_OFFICE: 'module.front_office',
  MODULE_ONLINE_PAYMENTS: 'module.online_payments',
  MODULE_CUSTOM_DOMAIN: 'module.custom_domain',
  MODULE_WHITE_LABEL_APP: 'module.white_label_app',
  MODULE_AI_ASSIST: 'module.ai_assist',

  LIMIT_STUDENTS: 'limit.students',
  LIMIT_STAFF: 'limit.staff',
  LIMIT_ADMIN_USERS: 'limit.admin_users',
  LIMIT_STORAGE_MB: 'limit.storage_mb',
  LIMIT_SMS_PER_MONTH: 'limit.sms_per_month',
  LIMIT_WHATSAPP_PER_MONTH: 'limit.whatsapp_per_month',
  LIMIT_DOMAINS: 'limit.domains',
} as const

export type FeatureKey = (typeof FEATURE)[keyof typeof FEATURE]

export type Entitlement = { enabled: boolean; limit: number | null }

export type EntitlementMap = Record<string, Entitlement>

/**
 * Effective entitlements = plan defaults, then per-tenant overrides.
 * A tenant with no subscription gets nothing enabled, which is the safe
 * default for an expired or unprovisioned school.
 */
export const getEntitlements = cache(
  async (tenantId: string): Promise<EntitlementMap> => {
    const sub = await prisma.subscription.findUnique({
      where: { tenantId },
      include: { plan: { include: { entitlements: true } } },
    })

    const map: EntitlementMap = {}
    if (sub) {
      for (const e of sub.plan.entitlements) {
        map[e.featureKey] = { enabled: e.enabled, limit: e.limitValue }
      }
    }

    const overrides = await prisma.tenantEntitlementOverride.findMany({
      where: { tenantId },
    })
    for (const o of overrides) {
      const base = map[o.featureKey] ?? { enabled: false, limit: null }
      map[o.featureKey] = {
        enabled: o.enabled ?? base.enabled,
        limit: o.limitValue ?? base.limit,
      }
    }
    return map
  },
)

export async function hasFeature(tenantId: string, key: FeatureKey): Promise<boolean> {
  const map = await getEntitlements(tenantId)
  return map[key]?.enabled ?? false
}

export async function limitFor(
  tenantId: string,
  key: FeatureKey,
): Promise<number | null> {
  const map = await getEntitlements(tenantId)
  return map[key]?.limit ?? null
}

export class QuotaExceededError extends Error {
  status = 402
  constructor(
    readonly feature: FeatureKey,
    readonly limit: number,
    readonly current: number,
  ) {
    super(
      `Your plan allows ${limit} for ${feature}. You are currently at ${current}. Upgrade to add more.`,
    )
    this.name = 'QuotaExceededError'
  }
}

/**
 * Enforces a numeric limit before a create. `current` is passed in by the
 * caller because counting is module-specific (active students, staff, …).
 */
export async function assertWithinLimit(
  tenantId: string,
  key: FeatureKey,
  current: number,
  adding = 1,
): Promise<void> {
  const limit = await limitFor(tenantId, key)
  if (limit === null) return // unlimited
  if (current + adding > limit) {
    throw new QuotaExceededError(key, limit, current)
  }
}

export async function assertFeature(tenantId: string, key: FeatureKey): Promise<void> {
  if (!(await hasFeature(tenantId, key))) {
    const err = new Error('This module is not included in your current plan')
    ;(err as { status?: number }).status = 402
    throw err
  }
}
