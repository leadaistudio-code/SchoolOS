import type { NextRequest } from 'next/server'
import { platformRoute } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { listTenants, provisionTenant } from '@/server/modules/platform/tenants'
import { listTenantsSchema, provisionTenantSchema } from '@/server/modules/platform/schema'

export const GET = platformRoute(
  async (req: NextRequest, ctx) => {
    const q = Object.fromEntries(req.nextUrl.searchParams)
    const query = listTenantsSchema.parse(q)
    const result = await listTenants(ctx, query)
    return ok(result.rows, result.meta)
  },
  { permission: 'platform.tenants' },
)

export const POST = platformRoute(
  async (req: NextRequest, ctx) => {
    const body = await req.json()
    const input = provisionTenantSchema.parse(body)
    const result = await provisionTenant(ctx, input)
    return ok(result, undefined, { status: 201 })
  },
  { permission: 'platform.tenants', rateLimitKey: 'mutation' },
)
