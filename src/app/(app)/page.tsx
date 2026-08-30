import { Suspense } from 'react'
import { requireContext } from '@/server/context'
import { AdminDashboard } from './dashboard-admin'
import { SelfDashboard } from './dashboard-self'
import { TeacherDashboard } from './dashboard-teacher'
import { isSelfScoped, isTeacherScoped } from '@/lib/rbac/roles'
import { DashboardSkeleton } from '@/components/dashboard/skeletons'

export const metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const ctx = await requireContext('dashboard.view')

  // Students and parents get a fundamentally different page, not a cut-down
  // version of the staff dashboard.
  const selfScoped = isSelfScoped(ctx.user.roleKeys)
  const teacherScoped = isTeacherScoped(ctx.user.roleKeys)

  return (
    <Suspense fallback={<DashboardSkeleton />}>
      {selfScoped ? <SelfDashboard /> : teacherScoped ? <TeacherDashboard /> : <AdminDashboard />}
    </Suspense>
  )
}
