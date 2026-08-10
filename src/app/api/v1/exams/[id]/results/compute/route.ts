import { route } from '@/server/api/handler'
import { badRequest, ok } from '@/server/api/response'
import { computeResults } from '@/server/modules/exams/service'

export const POST = route(async (_req, ctx, params) => {
  if (!params.id) throw badRequest('Exam id is required')
  return ok(await computeResults(ctx, params.id))
}, { permission: 'exams.manage', rateLimitKey: 'mutation' })
