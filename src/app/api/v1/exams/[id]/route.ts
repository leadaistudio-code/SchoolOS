import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { badRequest, ok } from '@/server/api/response'
import { setExamGradingScale } from '@/server/modules/exams/service'

export const PATCH = route(async (req: NextRequest, ctx, params) => {
  if (!params.id) throw badRequest('Exam id is required')
  const body = await req.json()
  if (typeof body.gradingScaleId !== 'string') throw badRequest('gradingScaleId is required')
  return ok(await setExamGradingScale(ctx, params.id, body.gradingScaleId))
}, { permission: 'exams.manage', rateLimitKey: 'mutation' })
