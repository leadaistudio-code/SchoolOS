import Link from 'next/link'
import { ClipboardList, Clock, Plus } from 'lucide-react'
import { requireContext } from '@/server/context'
import { listLeave, leaveListFilterSchema } from '@/server/modules/leave/service'
import { parseListQuery } from '@/lib/query'
import { formatNumber } from '@/lib/utils'
import {
  ColorBanner,
  ColorTile,
  colorBannerPrimaryBtn,
} from '@/components/dashboard/color-tiles'
import { Card } from '@/components/ui/card'
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
    <div className="space-y-4">
      <ColorBanner
        tone="leave"
        eyebrow="Leave"
        title={
          canApprove
            ? `${formatNumber(total)} leave request${total === 1 ? '' : 's'}`
            : 'Your leave requests'
        }
        description={
          canApprove
            ? pendingCount
              ? `${formatNumber(pendingCount)} awaiting your decision on this page`
              : 'Review and decide on staff leave'
            : 'Your leave requests and their status'
        }
        actions={
          ctx.can('leave.apply') ? (
            <Link href="/leave/apply" className={colorBannerPrimaryBtn()}>
              <Plus aria-hidden />
              Apply for leave
            </Link>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <ColorTile
          label="Total"
          value={formatNumber(total)}
          sub="Matching these filters"
          tone="leave"
          icon={<ClipboardList className="size-5" aria-hidden />}
          delayMs={40}
        />
        <ColorTile
          label="Pending on page"
          value={formatNumber(pendingCount)}
          sub="Awaiting a decision"
          tone={pendingCount > 0 ? 'overdue' : 'pending'}
          icon={<Clock className="size-5" aria-hidden />}
          delayMs={80}
        />
      </div>

      <Card variant="elevated" className="overflow-hidden">
        <LeaveFilters canApprove={canApprove} />
        <LeaveList rows={rows} canApprove={canApprove} />
      </Card>
    </div>
  )
}
