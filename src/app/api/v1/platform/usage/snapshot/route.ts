import type { NextRequest } from 'next/server'
import { platformRoute } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { snapshotUsage } from '@/server/modules/platform/usage'
import { usageSnapshotSchema } from '@/server/modules/platform/schema'

export const POST = platformRoute(
  async (req: NextRequest, ctx) => {
    const body = await req.json()
    const input = usageSnapshotSchema.parse(body)
    return ok(await snapshotUsage(ctx, input.tenantId))
  },
  { permission: 'platform.tenants', rateLimitKey: 'mutation' },
)
