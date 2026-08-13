import type { NextRequest } from 'next/server'
import { platformRoute } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { setEntitlementOverride } from '@/server/modules/platform/tenants'
import { entitlementOverrideSchema } from '@/server/modules/platform/schema'

export const POST = platformRoute(
  async (req: NextRequest, ctx, params) => {
    const body = await req.json()
    const input = entitlementOverrideSchema.parse(body)
    return ok(await setEntitlementOverride(ctx, params.id, input))
  },
  { permission: 'platform.tenants', rateLimitKey: 'mutation' },
)
