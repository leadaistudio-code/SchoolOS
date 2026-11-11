import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { isAcademy } from '@/server/modules/lms/academy-tenant'
import { isPortalOnlyRole } from '@/server/scope'
import { requireContext } from '@/server/context'
import { AdminDashboard } from './dashboard-admin'
import { SelfDashboard } from './dashboard-self'
import { TeacherDashboard } from './dashboard-teacher'
import { RoleDashboard } from './dashboard-role'
import { hasSchoolWideScope, isSelfScoped, isTeacherScoped } from '@/lib/rbac/roles'
import { DashboardSkeleton } from '@/components/dashboard/skeletons'

export const metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const ctx = await requireContext()
  if (isAcademy(ctx.tenant) && isPortalOnlyRole(ctx.user.roleKeys)) redirect('/my/learning')
  if (!ctx.can('dashboard.view')) redirect('/403')

  // Students and parents get a fundamentally different page, not a cut-down
  // version of the staff dashboard.
  const selfScoped = isSelfScoped(ctx.user.roleKeys)
  const teacherScoped = isTeacherScoped(ctx.user.roleKeys)
  const schoolWide = hasSchoolWideScope(ctx.user.roleKeys)

  return (
    <Suspense fallback={<DashboardSkeleton />}>
      {selfScoped
        ? <SelfDashboard />
        : teacherScoped
          ? <TeacherDashboard />
          : schoolWide
            ? <AdminDashboard />
            : <RoleDashboard />}
    </Suspense>
  )
}
