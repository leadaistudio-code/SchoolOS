import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { reorderSchema, reorderSections } from '@/server/modules/assessments/service'

export const POST = route(
  async (req: NextRequest, ctx, params) => {
    const { ids } = reorderSchema.parse(await req.json())
    await reorderSections(ctx, params.id!, ids)
    return ok({ reordered: ids.length })
  },
  { permission: 'assessments.edit', rateLimitKey: 'mutation' },
)
