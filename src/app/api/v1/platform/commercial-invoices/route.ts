import type { NextRequest } from 'next/server'
import { platformRoute } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import {
  createCommercialInvoice,
  createCommercialInvoiceSchema,
  listCommercialInvoices,
  listCommercialInvoicesSchema,
} from '@/server/modules/platform/commercial-invoices'

export const GET = platformRoute(
  async (req: NextRequest, ctx) => {
    const query = listCommercialInvoicesSchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    const result = await listCommercialInvoices(ctx, query)
    return ok(result.rows, result.meta)
  },
  { permission: 'platform.billing' },
)

export const POST = platformRoute(
  async (req: NextRequest, ctx) => {
    const body = await req.json()
    const input = createCommercialInvoiceSchema.parse(body)
    return ok(await createCommercialInvoice(ctx, input), undefined, { status: 201 })
  },
  { permission: 'platform.billing', rateLimitKey: 'mutation' },
)
