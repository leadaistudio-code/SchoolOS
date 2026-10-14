import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { createVendor, listVendors } from '@/server/modules/accounting/payables-service'

export const GET = route(
  async (req: NextRequest, ctx) => {
    const list = await listVendors(ctx, Object.fromEntries(req.nextUrl.searchParams))
    return ok(list.rows, {
      page: list.page,
      pageSize: list.pageSize,
      total: list.total,
      totalPages: Math.max(1, Math.ceil(list.total / list.pageSize)),
    })
  },
  { permission: 'accounts.view' },
)

export const POST = route(
  async (req: NextRequest, ctx) => ok(await createVendor(ctx, await req.json()), undefined, { status: 201 }),
  { permission: 'accounts.manage', rateLimitKey: 'mutation' },
)
