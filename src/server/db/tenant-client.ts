import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { isTenantOwnedOptional, isTenantScoped, isTenantSharedOptional } from './tenant-models'

export class TenantIsolationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TenantIsolationError'
  }
}

// Operations that accept a `where` we must narrow. Prisma supports non-unique
// filters alongside a unique field in `where` (extended where-unique, GA since
// v5), so findUnique/update/delete can be narrowed in place rather than being
// rewritten into a second query - which keeps this safe inside transactions.
const WHERE_OPS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
])

const CREATE_OPS = new Set(['create', 'createMany', 'createManyAndReturn'])

function narrow(where: unknown, tenantId: string): Record<string, unknown> {
  const base = (where ?? {}) as Record<string, unknown>
  // A caller-supplied tenantId is never trusted; ours always wins.
  return { ...base, tenantId }
}

/**
 * Narrows a model whose rows may belong to this tenant OR to the platform.
 *
 * The guard goes into `AND` rather than onto `OR` at the top level: callers
 * legitimately use `OR` themselves (asking for a system role or their own),
 * and overwriting that key would silently change which rows they asked for.
 */
function narrowShared(where: unknown, tenantId: string): Record<string, unknown> {
  const base = (where ?? {}) as Record<string, unknown>
  const existing = Array.isArray(base.AND) ? base.AND : base.AND ? [base.AND] : []
  return {
    ...base,
    AND: [...existing, { OR: [{ tenantId }, { tenantId: null }] }],
  }
}

function stamp(data: unknown, tenantId: string): unknown {
  if (Array.isArray(data)) return data.map((d) => ({ ...(d as object), tenantId }))
  return { ...(data as object), tenantId }
}

function stripTenantId(data: unknown) {
  if (data && typeof data === 'object') {
    delete (data as Record<string, unknown>).tenantId
  }
}

/**
 * Returns a Prisma client permanently bound to one tenant.
 *
 * Every read is narrowed by `tenantId`, every write is stamped with it, and no
 * caller can widen the scope by passing their own `tenantId` - it is
 * overwritten on reads and stripped from updates. A request that guesses
 * another school's primary key gets `null` (or P2025), not data.
 *
 * This is the enforced isolation mechanism. `prisma/rls.sql` ships an
 * optional Postgres row-level-security hardening layer for deployments that
 * want defence in depth; see docs/SECURITY.md for how to enable it.
 */
export function tenantDb(tenantId: string) {
  if (!tenantId) throw new TenantIsolationError('tenantDb() called without a tenantId')

  return prisma.$extends({
    name: 'tenant-isolation',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const owned = isTenantOwnedOptional(model)
          const shared = isTenantSharedOptional(model)

          // Models with an optional tenantId are filtered on read but never
          // stamped on create: the column is nullable precisely because some
          // rows belong to the platform rather than to a school.
          if (owned || shared) {
            const a = args as Record<string, unknown>
            const apply = shared ? narrowShared : narrow

            if (WHERE_OPS.has(operation)) a.where = apply(a.where, tenantId)
            if (operation === 'upsert') a.where = apply(a.where, tenantId)

            return query(a)
          }

          if (!isTenantScoped(model)) return query(args)

          const a = args as Record<string, unknown>

          if (WHERE_OPS.has(operation)) {
            a.where = narrow(a.where, tenantId)
          }

          if (CREATE_OPS.has(operation) && a.data !== undefined) {
            a.data = stamp(a.data, tenantId)
          }

          if (operation === 'update' || operation === 'updateMany') {
            stripTenantId(a.data)
          }

          if (operation === 'upsert') {
            a.where = narrow(a.where, tenantId)
            if (a.create) a.create = stamp(a.create, tenantId)
            stripTenantId(a.update)
          }

          return query(a)
        },
      },
    },
  })
}

export type TenantClient = ReturnType<typeof tenantDb>

/** SQL used to bind the current tenant for Postgres RLS policies. */
export function tenantRlsSetLocalSql(tenantId: string): string {
  // Guard against injection: tenant ids are cuids (alphanumeric).
  if (!/^[a-zA-Z0-9_-]+$/.test(tenantId)) {
    throw new TenantIsolationError('Invalid tenant id for RLS context')
  }
  return `SELECT set_config('app.tenant_id', '${tenantId}', true)`
}

export function databaseRlsEnabled(): boolean {
  try {
    // Lazy import avoids circular env load during unit tests that only
    // exercise assignClassRanks-style helpers.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { env } = require('@/lib/env') as typeof import('@/lib/env')
    return env().DATABASE_RLS === true
  } catch {
    return process.env.DATABASE_RLS === 'true' || process.env.DATABASE_RLS === '1'
  }
}

/**
 * Runs `fn` in a transaction on the tenant-bound client. Client extensions
 * apply to the transactional client too, so isolation is preserved.
 *
 * When `DATABASE_RLS=true`, also sets `app.tenant_id` for the transaction so
 * Postgres policies in prisma/rls.sql can filter rows.
 */
export async function tenantTx<T>(
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { timeout?: number; maxWait?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
): Promise<T> {
  const db = tenantDb(tenantId)
  return db.$transaction(
    async (tx) => {
      const client = tx as unknown as Prisma.TransactionClient
      if (databaseRlsEnabled()) {
        await client.$executeRawUnsafe(tenantRlsSetLocalSql(tenantId))
      }
      return fn(client)
    },
    options,
  )
}
