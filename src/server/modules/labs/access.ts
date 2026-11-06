import { redirect } from 'next/navigation'
import { requireContext, type AppContext } from '@/server/context'
import { ApiException } from '@/server/api/response'
import { audit } from '@/server/audit'
import { FEATURE, hasFeature } from '@/server/entitlements'

/** The science lab is a paid add-on; every lab service call goes through this. */
export async function assertLabs(ctx: AppContext) {
  if (!(await hasFeature(ctx.tenant.id, FEATURE.MODULE_SCIENCE_LAB))) {
    throw new ApiException(
      402,
      'ADD_ON_REQUIRED',
      'The Labs add-on (Science and Robotics & AI) is not active for this school. Contact MyCampusView to switch it on.',
    )
  }
}

/** Page guard: permission first, then the add-on, which shows the upgrade page when off. */
export async function requireLabs(permission = 'labs.view'): Promise<AppContext> {
  const ctx = await requireContext(permission)
  if (!(await hasFeature(ctx.tenant.id, FEATURE.MODULE_SCIENCE_LAB))) redirect('/labs/upgrade')
  return ctx
}

export function actorLabel(ctx: AppContext) {
  return `${ctx.user.firstName} ${ctx.user.lastName}`.trim()
}

export async function auditLab(
  ctx: AppContext,
  action: string,
  entityType: string,
  entityId: string,
  summary: string,
  after?: unknown,
) {
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: actorLabel(ctx),
    action,
    module: 'labs',
    entityType,
    entityId,
    summary,
    after: after as never,
  })
}

/** Calendar date stored in a @db.Date column. */
export function dateOnly(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

export function isoOf(date: Date): string {
  return date.toISOString().slice(0, 10)
}
