import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { currentStudent } from '@/server/modules/tapasya/people'
import { planDay, reviewToday } from '@/server/modules/tapasya/tasks'
import { planQuerySchema } from '@/server/modules/tapasya/schema'

/** GET /tapasya/plan — suggested order for today; ?review=1 for the end-of-day review. */
export const GET = route(async (req: NextRequest, ctx) => {
  const student = await currentStudent(ctx)
  const params = Object.fromEntries(req.nextUrl.searchParams.entries())
  if (params.review === '1') return ok(await reviewToday(ctx, student.id))
  return ok(await planDay(ctx, student.id, planQuerySchema.parse(params)))
}, { permission: 'tapasya.use' })
