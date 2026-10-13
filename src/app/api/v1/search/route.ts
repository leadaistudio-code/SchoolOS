import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { globalSearch } from '@/server/modules/search/global-search'

/**
 * Global search across pages and records.
 *
 * Each source is queried only if the caller holds the matching permission and
 * is narrowed by the same row-level scope as its module, so search can never
 * become a side channel around authorization.
 */
export const GET = route(async (req: NextRequest, ctx) => {
  return ok(await globalSearch(ctx, req.nextUrl.searchParams.get('q') ?? ''))
})
