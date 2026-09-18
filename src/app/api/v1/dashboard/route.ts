import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { getAdminDashboard, getTeacherDashboard } from '@/server/modules/dashboard/service'
import { hasSchoolWideScope, isSelfScoped, isTeacherScoped } from '@/lib/rbac/roles'
import { scopedStudents } from '@/server/scope'

/**
 * GET /api/v1/dashboard — returns a payload selected by identity scope.
 *
 * A shared `dashboard.view` capability only permits opening a dashboard; it
 * never implies school-wide data. Parent/student, teacher, operational, and
 * leadership accounts therefore receive different response shapes.
 */
export const GET = route(async (_req, ctx) => {
  if (isSelfScoped(ctx.user.roleKeys)) {
    return ok({ scope: 'SELF', students: await scopedStudents(ctx) })
  }
  if (isTeacherScoped(ctx.user.roleKeys)) {
    return ok({ scope: 'TEACHER', ...(await getTeacherDashboard(ctx)) })
  }
  if (hasSchoolWideScope(ctx.user.roleKeys)) {
    return ok({ scope: 'SCHOOL', ...(await getAdminDashboard(ctx)) })
  }
  return ok({ scope: 'ROLE', roles: ctx.user.roleKeys })
}, {
  permission: 'dashboard.view',
})
