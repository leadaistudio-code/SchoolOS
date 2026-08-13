import type { NextRequest } from 'next/server'
import { platformRoute } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { startImpersonation } from '@/server/modules/platform/impersonation'
import { impersonateSchema } from '@/server/modules/platform/schema'

export const POST = platformRoute(
  async (req: NextRequest, ctx) => {
    const body = await req.json()
    const input = impersonateSchema.parse(body)
    const result = await startImpersonation(ctx, input)
    return ok(result)
  },
  { permission: 'platform.impersonate', rateLimitKey: 'mutation' },
)
