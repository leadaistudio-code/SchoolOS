import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { listAssessmentTypes } from '@/server/modules/assessments/service'

/** Seeds the school's default set on first read, then returns it. */
export const GET = route(
  async (_req: NextRequest, ctx) => ok(await listAssessmentTypes(ctx)),
  { permission: 'assessments.view' },
)
