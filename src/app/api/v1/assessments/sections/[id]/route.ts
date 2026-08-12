import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { deleteSection, sectionUpdateSchema, updateSection } from '@/server/modules/assessments/service'

export const PATCH = route(
  async (req: NextRequest, ctx, params) => {
    const input = sectionUpdateSchema.parse(await req.json())
    return ok(await updateSection(ctx, params.id!, input))
  },
  { permission: 'assessments.edit', rateLimitKey: 'mutation' },
)

export const DELETE = route(
  async (_req: NextRequest, ctx, params) => {
    await deleteSection(ctx, params.id!)
    return ok({ deleted: true })
  },
  { permission: 'assessments.edit', rateLimitKey: 'mutation' },
)
