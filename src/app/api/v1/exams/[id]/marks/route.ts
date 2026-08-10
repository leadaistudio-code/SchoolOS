import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { badRequest, ok } from '@/server/api/response'
import { marksRoster, marksSaveSchema, saveMarks } from '@/server/modules/exams/service'

export const GET = route(async (req: NextRequest, ctx, params) => {
  if (!params.id) throw badRequest('Exam id is required')
  const examSubjectId = req.nextUrl.searchParams.get('examSubjectId')
  if (!examSubjectId) throw badRequest('examSubjectId is required')
  return ok(await marksRoster(ctx, params.id, examSubjectId))
}, { permission: 'exams.marks' })

export const PUT = route(async (req: NextRequest, ctx, params) => {
  if (!params.id) throw badRequest('Exam id is required')
  const body = await req.json()
  if (typeof body.examSubjectId !== 'string') throw badRequest('examSubjectId is required')
  return ok(await saveMarks(ctx, params.id, body.examSubjectId, marksSaveSchema.parse(body)))
}, { permission: 'exams.marks', rateLimitKey: 'mutation' })
