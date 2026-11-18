import type { NextRequest } from 'next/server'
import { publicRoute } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { assertCronSecret } from '@/server/api/cron-auth'
import { prisma } from '@/server/db/prisma'
import { runSchoolLeadDiscovery } from '@/server/modules/platform/growth/discovery/runner'
import type { PlatformContext } from '@/server/context'
import type { SessionUser } from '@/server/auth/session'

/**
 * AI School Lead Discovery cron.
 *
 *   POST /api/cron/growth-discovery
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Prefer once daily (early morning). Uses a least-privilege platform CRM
 * identity — not a synthetic SUPER_ADMIN session — when auto-creating leads.
 */
export const POST = publicRoute(async (req: NextRequest) => {
  assertCronSecret(req)

  const operator = await prisma.user.findFirst({
    where: {
      tenantId: null,
      deletedAt: null,
      status: 'ACTIVE',
      roles: { some: { role: { key: 'SUPER_ADMIN' } } },
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      displayName: true,
      phone: true,
      avatarUrl: true,
      mustChangePassword: true,
    },
  })

  let ctx: PlatformContext | null = null
  if (operator) {
    const user: SessionUser = {
      sessionId: 'cron-growth-discovery',
      userId: operator.id,
      tenantId: null,
      isSuperAdmin: false,
      firstName: operator.firstName,
      lastName: operator.lastName,
      displayName: operator.displayName,
      email: operator.email,
      phone: operator.phone,
      avatarUrl: operator.avatarUrl,
      mustChangePassword: operator.mustChangePassword,
      roleKeys: ['PLATFORM_CRON'],
      permissions: new Set([
        'platform.crm',
        'platform.crm_create',
        'platform.crm_edit',
        'platform.crm_assign',
      ]),
      impersonatedById: null,
    }
    ctx = { user, db: prisma }
  }

  const report = await runSchoolLeadDiscovery(ctx, { triggeredBy: 'cron' })
  return ok(report)
})
