import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { chapterCreateSchema, createChapter } from '@/server/modules/curriculum/service'

export const POST = route(
  async (req: NextRequest, ctx) => {
    const input = chapterCreateSchema.parse(await req.json())
    return ok(await createChapter(ctx, input), undefined, { status: 201 })
  },
  { permission: 'curriculum.manage', rateLimitKey: 'mutation' },
)
