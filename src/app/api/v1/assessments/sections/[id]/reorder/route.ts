import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { reorderPlacements, reorderSchema } from '@/server/modules/assessments/service'

export const POST = route(
  async (req: NextRequest, ctx, params) => {
    const { ids } = reorderSchema.parse(await req.json())
    await reorderPlacements(ctx, params.id!, ids)
    return ok({ reordered: ids.length })
  },
  { permission: 'assessments.edit', rateLimitKey: 'mutation' },
)
