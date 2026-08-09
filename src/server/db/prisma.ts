import { PrismaClient } from '@prisma/client'
import { env } from '@/lib/env'

/**
 * Raw, UNSCOPED Prisma client.
 *
 * Direct use is limited to: authentication, tenant resolution, the SaaS
 * control plane, background workers and migrations/seeds. Everything that
 * serves a signed-in tenant user must go through `tenantDb()` instead, which
 * refuses to run a query that is not bound to a tenant.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      env().LOG_LEVEL === 'debug'
        ? ['query', 'warn', 'error']
        : ['warn', 'error'],
  })

if (env().NODE_ENV !== 'production') globalForPrisma.prisma = prisma
