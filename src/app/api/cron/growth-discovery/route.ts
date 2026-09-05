import type { NextRequest } from 'next/server'
import { publicRoute } from '@/server/api/handler'
import { ok, ApiException } from '@/server/api/response'
import { env } from '@/lib/env'
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
 * Prefer once daily (early morning). Uses first ACTIVE SUPER_ADMIN when
 * auto-creating CRM leads through existing Growth CRM services.
 */
export const POST = publicRoute(async (req: NextRequest) => {
  const secret = env().CRON_SECRET
  if (!secret) {
    throw new ApiException(503, 'CRON_DISABLED', 'Scheduled jobs are not configured (set CRON_SECRET).')
  }

  const provided =
    req.headers.get('x-cron-secret') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    ''
  if (provided !== secret) {
    throw new ApiException(401, 'UNAUTHORIZED', 'Invalid or missing cron secret.')
  }

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
      isSuperAdmin: true,
      firstName: operator.firstName,
      lastName: operator.lastName,
      email: operator.email,
      phone: operator.phone,
      avatarUrl: operator.avatarUrl,
      mustChangePassword: operator.mustChangePassword,
      roleKeys: ['SUPER_ADMIN'],
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
