import { Suspense } from 'react'
import { requireContext } from '@/server/context'
import { AdminDashboard } from './dashboard-admin'
import { SelfDashboard } from './dashboard-self'
import { isSelfScoped } from '@/lib/rbac/roles'
import { DashboardSkeleton } from '@/components/dashboard/skeletons'

export const metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const ctx = await requireContext('dashboard.view')

  // Students and parents get a fundamentally different page, not a cut-down
  // version of the staff dashboard.
  const selfScoped = isSelfScoped(ctx.user.roleKeys)

  return (
    <Suspense fallback={<DashboardSkeleton />}>
      {selfScoped ? <SelfDashboard /> : <AdminDashboard />}
    </Suspense>
  )
}
