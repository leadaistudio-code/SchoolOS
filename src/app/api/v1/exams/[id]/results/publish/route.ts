import { route } from '@/server/api/handler'
import { badRequest, ok } from '@/server/api/response'
import { publishResults } from '@/server/modules/exams/service'

export const POST = route(async (_req, ctx, params) => {
  if (!params.id) throw badRequest('Exam id is required')
  return ok(await publishResults(ctx, params.id))
}, { permission: 'exams.publish', rateLimitKey: 'mutation' })
