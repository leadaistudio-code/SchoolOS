import Link from 'next/link'
import { differenceInCalendarDays } from 'date-fns'
import { requireContext } from '@/server/context'
import { pendingStaffApprovals } from '@/server/modules/staff/performance'
import { formatDay } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Metric, MetricRow } from '@/components/ui/metric'
import { StaffTabs } from '../tabs'
import { LeaveDecision } from '../leave-decision'

export const metadata = { title: 'Staff approvals' }

/**
 * Staff leave awaiting a decision.
 *
 * Ordered by the date the leave starts rather than by when it was applied
 * for: a request for next Monday matters more than an older one for December,
 * and a queue that buries it is the reason people ring the office instead.
 */
export default async function StaffApprovalsPage() {
  const ctx = await requireContext('leave.view')
  const pending = await pendingStaffApprovals(ctx)
  const canDecide = ctx.can('leave.approve')

  const today = new Date()
  const starting = pending.filter((l) => differenceInCalendarDays(l.fromDate, today) <= 7)
  const alreadyStarted = pending.filter((l) => l.fromDate <= today)

  const days = (from: Date, to: Date) => differenceInCalendarDays(to, from) + 1

  return (
    <div className="space-y-4">
      <PageHeader
        title="Staff approvals"
        description={`${pending.length} leave requests awaiting a decision`}
        breadcrumbs={[{ label: 'Teachers & staff', href: '/staff' }, { label: 'Approvals' }]}
      />

      <StaffTabs
        active="approvals"
        ctxCan={{
          payroll: ctx.can('staff.payroll'),
          appraise: ctx.can('staff.appraise'),
          leave: true,
        }}
      />

      <MetricRow columns={3}>
        <Metric
          label="Awaiting a decision"
          value={String(pending.length)}
          sub="Staff leave only"
          emphasis={pending.length > 0 ? 'warning' : undefined}
        />
        <Metric
          label="Starting within a week"
          value={String(starting.length)}
          sub="Cover needs arranging"
          emphasis={starting.length > 0 ? 'warning' : undefined}
        />
        <Metric
          label="Already started"
          value={String(alreadyStarted.length)}
          sub="Decided after the fact"
          emphasis={alreadyStarted.length > 0 ? 'danger' : undefined}
        />
      </MetricRow>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Pending requests</CardTitle>
          <Link href="/leave" className="text-xs font-medium text-[var(--brand-600)] hover:underline">
            All leave
          </Link>
        </CardHeader>

        {pending.length === 0 ? (
          <EmptyState
            title="Nothing waiting"
            description="Staff leave requests appear here the moment they are submitted."
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {pending.map((l) => {
              const started = l.fromDate <= today
              return (
                <li key={l.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/staff/${l.staff?.id}`}
                      className="text-base font-medium text-ink hover:underline"
                    >
                      {l.staff?.firstName} {l.staff?.lastName}
                    </Link>
                    <span className="text-xs text-ink-subtle">
                      {l.staff?.designation ?? l.staff?.employeeCode}
                    </span>
                    {l.leaveType ? (
                      <Badge tone={l.leaveType.isPaid ? 'neutral' : 'warning'}>
                        {l.leaveType.name}
                        {l.leaveType.isPaid ? '' : ' · unpaid'}
                      </Badge>
                    ) : null}
                    {started ? <Badge tone="danger">already started</Badge> : null}
                    <span className="ml-auto text-xs tnum text-ink-subtle">
                      {formatDay(l.fromDate)} – {formatDay(l.toDate)} ·{' '}
                      {days(l.fromDate, l.toDate)} days
                    </span>
                  </div>

                  <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink-muted">{l.reason}</p>

                  {canDecide ? (
                    <div className="mt-3">
                      <LeaveDecision id={l.id} />
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-ink-subtle">
                      You can see requests but not decide them.
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
