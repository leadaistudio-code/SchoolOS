import { redirect } from 'next/navigation'
import { requireContext, type AppContext } from '@/server/context'
import { ApiException } from '@/server/api/response'
import { audit } from '@/server/audit'
import { FEATURE, hasFeature } from '@/server/entitlements'
import type { Actor } from './content'

/** Robotics & AI courses are a paid add-on; every school-side LMS call goes through this. */
export async function assertLms(ctx: AppContext) {
  if (!(await hasFeature(ctx.tenant.id, FEATURE.MODULE_ROBOTICS_LMS))) {
    throw new ApiException(
      402,
      'ADD_ON_REQUIRED',
      'Robotics & AI courses are not active for this school. Contact MyCampusView to switch them on.',
    )
  }
}

/** Page guard: permission first, then the add-on, which shows the upgrade page when off. */
export async function requireLms(permission = 'lms.view'): Promise<AppContext> {
  const ctx = await requireContext(permission)
  if (!(await hasFeature(ctx.tenant.id, FEATURE.MODULE_ROBOTICS_LMS))) redirect('/lms/upgrade')
  return ctx
}

export function actorOf(ctx: AppContext): Actor {
  return { id: ctx.user.userId, label: `${ctx.user.firstName} ${ctx.user.lastName}`.trim() }
}

export async function auditLms(ctx: AppContext, action: string, entityType: string, entityId: string, summary: string) {
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: actorOf(ctx).label,
    action,
    module: 'lms',
    entityType,
    entityId,
    summary,
  })
}
