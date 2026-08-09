import { Suspense } from 'react'
import { requireContext } from '@/server/context'
import { AdminDashboard } from './dashboard-admin'
import { SelfDashboard } from './dashboard-self'
import { isSelfScoped } from '@/lib/rbac/roles'
import { Skeleton } from '@/components/ui/states'

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

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-9 w-64" />
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  )
}
