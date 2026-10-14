import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { cancelVendorAdjustment } from '@/server/modules/accounting/payables-service'

const actionSchema = z.object({ action: z.literal('cancel'), reason: z.string().trim().min(3).max(1000) })

export const POST = route(
  async (req: NextRequest, ctx, params) => {
    const body = actionSchema.parse(await req.json())
    return ok(await cancelVendorAdjustment(ctx, params.id!, body.reason))
  },
  { permission: 'accounts.manage', rateLimitKey: 'mutation' },
)
