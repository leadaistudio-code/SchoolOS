import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { badRequest, ok } from '@/server/api/response'
import {
  examMarksSetup,
  marksRoster,
  marksSaveSchema,
  saveMarks,
} from '@/server/modules/exams/service'

/**
 * GET /api/v1/exams/:id/marks
 * - without examSubjectId → papers the caller may enter marks for
 * - with examSubjectId → student roster + existing marks for that paper
 */
export const GET = route(async (req: NextRequest, ctx, params) => {
  if (!params.id) throw badRequest('Exam id is required')
  const examSubjectId = req.nextUrl.searchParams.get('examSubjectId')
  if (!examSubjectId) return ok(await examMarksSetup(ctx, params.id))
  return ok(await marksRoster(ctx, params.id, examSubjectId))
}, { permission: 'exams.marks' })

export const PUT = route(async (req: NextRequest, ctx, params) => {
  if (!params.id) throw badRequest('Exam id is required')
  const body = await req.json()
  if (typeof body.examSubjectId !== 'string') throw badRequest('examSubjectId is required')
  return ok(await saveMarks(ctx, params.id, body.examSubjectId, marksSaveSchema.parse(body)))
}, { permission: 'exams.marks', rateLimitKey: 'mutation' })
