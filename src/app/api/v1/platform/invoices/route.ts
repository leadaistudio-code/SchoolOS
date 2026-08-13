import type { NextRequest } from 'next/server'
import { platformRoute } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { generateInvoice, listInvoices } from '@/server/modules/platform/billing'
import { generateInvoiceSchema, listInvoicesSchema } from '@/server/modules/platform/schema'

export const GET = platformRoute(
  async (req: NextRequest, ctx) => {
    const query = listInvoicesSchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    const result = await listInvoices(ctx, query)
    return ok(result.rows, result.meta)
  },
  { permission: 'platform.billing' },
)

export const POST = platformRoute(
  async (req: NextRequest, ctx) => {
    const body = await req.json()
    const input = generateInvoiceSchema.parse(body)
    return ok(await generateInvoice(ctx, input), undefined, { status: 201 })
  },
  { permission: 'platform.billing', rateLimitKey: 'mutation' },
)
