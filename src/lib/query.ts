import { z } from 'zod'

export const MAX_PAGE_SIZE = 100

/**
 * Shared list-query contract used by every table in the product: server-side
 * pagination, sorting, filtering and search. Nothing loads an unbounded set.
 */
export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(25),
  q: z.string().trim().max(120).optional(),
  sort: z.string().max(60).optional(),
  dir: z.enum(['asc', 'desc']).default('asc'),
})

export type ListQuery = z.infer<typeof listQuerySchema>

export function parseListQuery(searchParams: URLSearchParams | Record<string, unknown>) {
  const raw =
    searchParams instanceof URLSearchParams
      ? Object.fromEntries(searchParams.entries())
      : searchParams
  return listQuerySchema.parse(raw)
}

export function skipTake(query: Pick<ListQuery, 'page' | 'pageSize'>) {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize }
}

/**
 * Builds a Prisma orderBy from a whitelist, so a client-supplied sort key can
 * never reach the query planner unchecked.
 */
export function orderByFrom<T extends string>(
  sort: string | undefined,
  dir: 'asc' | 'desc',
  allowed: readonly T[],
  fallback: Record<string, 'asc' | 'desc'>,
): Record<string, unknown> {
  if (!sort || !allowed.includes(sort as T)) return fallback
  if (sort.includes('.')) {
    const [rel, field] = sort.split('.') as [string, string]
    return { [rel]: { [field]: dir } }
  }
  return { [sort]: dir }
}
