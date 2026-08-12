import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { reorderChapters, reorderSchema } from '@/server/modules/curriculum/service'

/** Reorders the chapters of one syllabus. Takes the complete ordered list. */
export const POST = route(
  async (req: NextRequest, ctx, params) => {
    const { ids } = reorderSchema.parse(await req.json())
    await reorderChapters(ctx, params.id!, ids)
    return ok({ reordered: ids.length })
  },
  { permission: 'curriculum.manage', rateLimitKey: 'mutation' },
)
