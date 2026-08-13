import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { setPrimaryDomain } from '@/server/modules/domains/service'

export const POST = route(
  async (_req: NextRequest, ctx, params) => {
    const domain = await setPrimaryDomain(ctx, params.id!)
    return ok(domain)
  },
  { permission: 'settings.manage', rateLimitKey: 'mutation' },
)
