import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { createFixedAsset, listFixedAssets } from '@/server/modules/accounting/fixed-assets-service'

export const GET = route(
  async (req: NextRequest, ctx) => {
    const list = await listFixedAssets(ctx, Object.fromEntries(req.nextUrl.searchParams))
    return ok(
      { rows: list.rows, totals: list.totals, categories: list.categories },
      { page: list.page, pageSize: list.pageSize, total: list.total, totalPages: Math.max(1, Math.ceil(list.total / list.pageSize)) },
    )
  },
  { permission: 'accounts.view' },
)

export const POST = route(
  async (req: NextRequest, ctx) => ok(await createFixedAsset(ctx, await req.json()), undefined, { status: 201 }),
  { permission: 'accounts.manage', rateLimitKey: 'mutation' },
)
