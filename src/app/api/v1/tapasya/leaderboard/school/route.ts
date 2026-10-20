import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { forbidden, ok } from '@/server/api/response'
import { schoolBoard } from '@/server/modules/tapasya/admin'
import { teachableStudentIds } from '@/server/modules/tapasya/people'

/** GET /tapasya/leaderboard/school — this school only, when the school enabled it. */
export const GET = route(async (req: NextRequest, ctx) => {
  if (!ctx.canAny('tapasya.use', 'tapasya.teach', 'tapasya.manage')) throw forbidden()
  const period = req.nextUrl.searchParams.get('period') === 'MONTHLY' ? 'MONTHLY' : 'WEEKLY'
  const sectionId = req.nextUrl.searchParams.get('sectionId')
  if (sectionId && !ctx.can('tapasya.manage')) {
    const scoped = await teachableStudentIds(ctx)
    if (scoped !== null) {
      const inSection = await ctx.db.enrollment.count({ where: { sectionId, isCurrent: true, studentId: { in: scoped } } })
      if (inSection === 0) throw forbidden('This class is not yours.')
    }
  }
  return ok(await schoolBoard(ctx, period, sectionId))
})
