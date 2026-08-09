import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok, paginationMeta } from '@/server/api/response'
import {
  generateInvoices,
  generateInvoicesSchema,
  invoiceFilterSchema,
  listInvoices,
} from '@/server/modules/finance/service'
import { parseListQuery } from '@/lib/query'

export const GET = route(
  async (req: NextRequest, ctx) => {
    const params = Object.fromEntries(req.nextUrl.searchParams.entries())
    const query = parseListQuery(params)
    const filter = invoiceFilterSchema.parse(params)
    const { rows, total, totals } = await listInvoices(ctx, query, filter)
    return ok({ invoices: rows, totals }, paginationMeta(query.page, query.pageSize, total))
  },
  { permission: 'fees.view' },
)

/** POST — bulk generation. Pass dryRun to preview without writing. */
export const POST = route(
  async (req: NextRequest, ctx) => {
    const input = generateInvoicesSchema.parse(await req.json())
    return ok(await generateInvoices(ctx, input), undefined, {
      status: input.dryRun ? 200 : 201,
    })
  },
  { permission: 'fees.invoice', rateLimitKey: 'mutation' },
)
