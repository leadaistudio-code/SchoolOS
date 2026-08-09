import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { isTenantScoped } from './tenant-models'

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

/**
 * Runs `fn` in a transaction on the tenant-bound client. Client extensions
 * apply to the transactional client too, so isolation is preserved.
 */
export async function tenantTx<T>(
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { timeout?: number; maxWait?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
): Promise<T> {
  const db = tenantDb(tenantId)
  return db.$transaction(
    async (tx) => fn(tx as unknown as Prisma.TransactionClient),
    options,
  )
}
