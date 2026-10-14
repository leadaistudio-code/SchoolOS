import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { getVendor360, updateVendor } from '@/server/modules/accounting/payables-service'

/** Vendor 360: profile, summary metrics, bill-wise outstanding and documents. */
export const GET = route(
  async (_req: NextRequest, ctx, params) => ok(await getVendor360(ctx, params.id!)),
  { permission: 'accounts.view' },
)

export const PATCH = route(
  async (req: NextRequest, ctx, params) => ok(await updateVendor(ctx, params.id!, await req.json())),
  { permission: 'accounts.manage', rateLimitKey: 'mutation' },
)
