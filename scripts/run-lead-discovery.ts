/* eslint-disable no-console */
import { prisma } from '../src/server/db/prisma'
import { runSchoolLeadDiscovery } from '../src/server/modules/platform/growth/discovery/runner'
import type { PlatformContext } from '../src/server/context'
import type { SessionUser } from '../src/server/auth/session'

async function main() {
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
      sessionId: 'cli-growth-discovery',
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

  const report = await runSchoolLeadDiscovery(ctx, { triggeredBy: 'cli' })
  console.log(JSON.stringify(report, null, 2))
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
