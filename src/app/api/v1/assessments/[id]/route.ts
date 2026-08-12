import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import {
  assessmentUpdateSchema,
  deleteAssessment,
  getAssessment,
  updateAssessment,
} from '@/server/modules/assessments/service'

export const GET = route(
  async (_req: NextRequest, ctx, params) => ok(await getAssessment(ctx, params.id!)),
  { permission: 'assessments.view' },
)

export const PATCH = route(
  async (req: NextRequest, ctx, params) => {
    const input = assessmentUpdateSchema.parse(await req.json())
    return ok(await updateAssessment(ctx, params.id!, input))
  },
  { permission: 'assessments.edit', rateLimitKey: 'mutation' },
)

export const DELETE = route(
  async (_req: NextRequest, ctx, params) => {
    await deleteAssessment(ctx, params.id!)
    return ok({ deleted: true })
  },
  { permission: 'assessments.delete', rateLimitKey: 'mutation' },
)
