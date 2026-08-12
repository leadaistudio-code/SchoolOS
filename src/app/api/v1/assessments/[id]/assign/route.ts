import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { assignSchema, createAssignment, listAssignmentsFor } from '@/server/modules/assessments/attempts'

export const GET = route(
  async (_req: NextRequest, ctx, params) => ok(await listAssignmentsFor(ctx, params.id!)),
  { permission: 'assessments.view' },
)

export const POST = route(
  async (req: NextRequest, ctx, params) => {
    const body = await req.json()
    const input = assignSchema.parse({ ...body, assessmentId: params.id! })
    return ok(await createAssignment(ctx, input), undefined, { status: 201 })
  },
  { permission: 'assessments.assign', rateLimitKey: 'mutation' },
)
