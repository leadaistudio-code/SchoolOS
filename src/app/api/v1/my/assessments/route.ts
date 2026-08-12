import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { myAssessments } from '@/server/modules/assessments/attempts'

/** The student's own list. Scoped to their enrolment, never to a parameter. */
export const GET = route(async (_req: NextRequest, ctx) => ok(await myAssessments(ctx)), {
  permission: 'assessments.attempt',
})
