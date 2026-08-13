import type { NextRequest } from 'next/server'
import { platformRoute } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { getTenant, updateTenant } from '@/server/modules/platform/tenants'
import { updateTenantSchema } from '@/server/modules/platform/schema'

export const GET = platformRoute(
  async (_req, ctx, params) => ok(await getTenant(ctx, params.id!)),
  { permission: 'platform.tenants' },
)

export const PATCH = platformRoute(
  async (req: NextRequest, ctx, params) => {
    const body = await req.json()
    const input = updateTenantSchema.parse(body)
    return ok(await updateTenant(ctx, params.id!, input))
  },
  { permission: 'platform.tenants', rateLimitKey: 'mutation' },
)
