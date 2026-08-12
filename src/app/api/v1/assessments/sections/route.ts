import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { createSection, sectionCreateSchema } from '@/server/modules/assessments/service'

export const POST = route(
  async (req: NextRequest, ctx) => {
    const input = sectionCreateSchema.parse(await req.json())
    return ok(await createSection(ctx, input), undefined, { status: 201 })
  },
  { permission: 'assessments.edit', rateLimitKey: 'mutation' },
)
