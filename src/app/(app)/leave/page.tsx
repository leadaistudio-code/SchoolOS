import Link from 'next/link'
import { Plus } from 'lucide-react'
import { requireContext } from '@/server/context'
import { listLeave, leaveListFilterSchema } from '@/server/modules/leave/service'
import { parseListQuery } from '@/lib/query'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button-variants'
import { LeaveList } from './leave-list'
import { LeaveFilters } from './leave-filters'

export const metadata = { title: 'Leave' }

export default async function LeavePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('leave.view')
  const params = await searchParams

  const query = parseListQuery(params)
  const filter = leaveListFilterSchema.parse(params)
  const { rows, total } = await listLeave(ctx, query, filter)

  const canApprove = ctx.can('leave.approve')
  const pendingCount = rows.filter((r) => r.status === 'PENDING').length

  return (
    <div>
      <PageHeader
        title="Leave"
        description={
          canApprove
            ? `${total} request${total === 1 ? '' : 's'}${pendingCount ? ` · ${pendingCount} awaiting your decision on this page` : ''}`
            : 'Your leave requests and their status'
        }
        actions={
          ctx.can('leave.apply') ? (
            <Link href="/leave/apply" className={buttonVariants({ size: 'sm' })}>
              <Plus className="size-4" aria-hidden />
              Apply for leave
            </Link>
          ) : null
        }
      />

      <Card className="overflow-hidden">
        <LeaveFilters canApprove={canApprove} />
        <LeaveList rows={rows} canApprove={canApprove} />
      </Card>
    </div>
  )
}
