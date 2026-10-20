import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { currentStudent } from '@/server/modules/tapasya/people'
import { studentDashboard } from '@/server/modules/tapasya/dashboard'

export const GET = route(async (_req, ctx) => {
  const student = await currentStudent(ctx)
  return ok(await studentDashboard(ctx, student))
}, { permission: 'tapasya.use' })
