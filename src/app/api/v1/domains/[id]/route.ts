import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { removeDomain } from '@/server/modules/domains/service'

export const DELETE = route(
  async (_req: NextRequest, ctx, { params }: { params: { id: string } }) => {
    await removeDomain(ctx, params.id)
    return ok({ success: true })
  },
  { permission: 'settings.manage', rateLimitKey: 'mutation' },
)
