import Link from 'next/link'
import { formatDay } from '@/lib/dates'
import { format } from 'date-fns'
import { requireContext } from '@/server/context'
import { getAdminDashboard } from '@/server/modules/dashboard/service'
import { StatCard } from '@/components/dashboard/stat-card'
import { AttendanceTrendChart, CollectionChart } from '@/components/dashboard/charts'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button-variants'
import { EmptyState } from '@/components/ui/states'
import { formatMoney, formatNumber, fullName } from '@/lib/utils'

export async function AdminDashboard() {
  const ctx = await requireContext('dashboard.view')
  const data = await getAdminDashboard(ctx)
  const currency = ctx.tenant.currency

  const quickActions = [
    { label: 'Add student', href: '/students/new', permission: 'students.create' },
    { label: 'Mark attendance', href: '/attendance', permission: 'attendance.mark' },
    { label: 'Collect fee', href: '/finance/collect', permission: 'fees.collect' },
    { label: 'Post notice', href: '/communication/notices/new', permission: 'notices.create' },
  ].filter((a) => ctx.can(a.permission))

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Good ${greeting()}, ${ctx.user.firstName}`}
        description={`${ctx.tenant.school?.name ?? ctx.tenant.name} · ${format(new Date(), 'EEEE, d MMMM yyyy')}`}
        actions={quickActions.map((a) => (
          <Link key={a.href} href={a.href} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            {a.label}
          </Link>
        ))}
      />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Students"
          value={formatNumber(data.people.students)}
          sub={`${data.people.teachers} teachers · ${data.people.staff} staff`}
          icon="GraduationCap"
          href="/students"
        />
        <StatCard
          label="Attendance today"
          value={data.attendance.marked ? `${data.attendance.percent}%` : 'Not marked'}
          sub={
            data.attendance.marked
              ? `${data.attendance.present} present · ${data.attendance.absent} absent · ${data.attendance.late} late`
              : 'No attendance recorded yet today'
          }
          icon="CalendarCheck"
          tone={data.attendance.marked ? 'success' : 'warning'}
          href="/attendance"
        />
        <StatCard
          label="Collected today"
          value={formatMoney(data.finance.collectedTodayMinor, currency)}
          sub={`${data.finance.paymentsToday} payments · ${formatMoney(data.finance.collectedMonthMinor, currency)} this month`}
          icon="BadgeIndianRupee"
          tone="info"
          href="/finance/payments"
        />
        <StatCard
          label="Outstanding fees"
          value={formatMoney(data.finance.outstandingMinor, currency)}
          sub={`${data.finance.overdueInvoices} invoices past due`}
          icon="AlertCircle"
          tone={data.finance.overdueInvoices > 0 ? 'danger' : 'success'}
          href="/finance/outstanding"
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Attendance trend</CardTitle>
              <p className="text-[13px] text-ink-muted mt-0.5">Last 7 school days</p>
            </div>
          </CardHeader>
          <CardContent>
            {data.attendance.trend.length === 0 ? (
              <EmptyState
                title="No attendance recorded yet"
                description="Once teachers start marking attendance, the weekly trend appears here."
                action={
                  ctx.can('attendance.mark') ? (
                    <Link href="/attendance" className={buttonVariants({ size: 'sm' })}>
                      Mark attendance
                    </Link>
                  ) : undefined
                }
              />
            ) : (
              <AttendanceTrendChart
                data={data.attendance.trend.map((d) => ({
                  label: format(d.day, 'EEE'),
                  percent: d.percent,
                }))}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Fee collection</CardTitle>
              <p className="text-[13px] text-ink-muted mt-0.5">Last 7 days</p>
            </div>
          </CardHeader>
          <CardContent>
            {data.finance.trend.length === 0 ? (
              <EmptyState
                title="No payments yet this week"
                description="Collected fees will be charted here as payments come in."
              />
            ) : (
              <CollectionChart
                currency={currency}
                data={data.finance.trend.map((d) => ({
                  label: format(d.day, 'd MMM'),
                  amount: d.amountMinor / 100,
                }))}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Recent payments</CardTitle>
            <Link href="/finance/payments" className="text-[12.5px] text-[var(--brand-600)] hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            {data.recentPayments.length === 0 ? (
              <EmptyState title="No payments recorded" description="Collected fees will appear here." />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {data.recentPayments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[13.5px] text-ink truncate">{fullName(p.student)}</p>
                      <p className="text-[12px] text-ink-subtle">
                        {p.student.admissionNo} · {p.mode.replace('_', ' ').toLowerCase()}
                      </p>
                    </div>
                    <span className="text-[13.5px] font-medium tnum text-ink shrink-0">
                      {formatMoney(p.amountMinor, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2.5">
            <AttentionRow
              label="Leave requests pending approval"
              value={data.pendingLeave}
              href="/leave"
              tone={data.pendingLeave > 0 ? 'warning' : 'neutral'}
            />
            <AttentionRow
              label="Invoices past due date"
              value={data.finance.overdueInvoices}
              href="/finance/outstanding"
              tone={data.finance.overdueInvoices > 0 ? 'danger' : 'neutral'}
            />
            <AttentionRow
              label="Library books overdue"
              value={data.library.overdue}
              href="/library"
              tone={data.library.overdue > 0 ? 'warning' : 'neutral'}
            />
            <AttentionRow
              label="Students not marked today"
              value={Math.max(0, data.attendance.expected - data.attendance.marked)}
              href="/attendance"
              tone={data.attendance.marked < data.attendance.expected ? 'warning' : 'neutral'}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Coming up</CardTitle>
            <Link href="/academics/calendar" className="text-[12.5px] text-[var(--brand-600)] hover:underline">
              Calendar
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            {data.upcomingExams.length === 0 && data.upcomingEvents.length === 0 ? (
              <EmptyState title="Nothing scheduled" description="Exams and events will show up here." />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {data.upcomingExams.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[13.5px] text-ink truncate">{e.name}</p>
                      <p className="text-[12px] text-ink-subtle">Exam</p>
                    </div>
                    <span className="text-[12px] text-ink-muted shrink-0">
                      {e.startsOn ? formatDay(e.startsOn, 'd MMM') : '-'}
                    </span>
                  </li>
                ))}
                {data.upcomingEvents.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[13.5px] text-ink truncate">{e.title}</p>
                      <p className="text-[12px] text-ink-subtle capitalize">
                        {e.kind.toLowerCase().replace('_', ' ')}
                      </p>
                    </div>
                    <span className="text-[12px] text-ink-muted shrink-0">
                      {format(e.startsAt, 'd MMM')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {ctx.can('audit.view') ? (
        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <Link href="/settings/audit" className="text-[12.5px] text-[var(--brand-600)] hover:underline">
              Full audit log
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            {data.recentActivity.length === 0 ? (
              <EmptyState title="No activity yet" description="Changes made in the system are recorded here." />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {data.recentActivity.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[13.5px] text-ink truncate">{a.summary ?? a.action}</p>
                      <p className="text-[12px] text-ink-subtle">{a.actorLabel ?? 'System'}</p>
                    </div>
                    <span className="text-[12px] text-ink-subtle shrink-0">
                      {format(a.createdAt, 'd MMM, HH:mm')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function AttentionRow({
  label,
  value,
  href,
  tone,
}: {
  label: string
  value: number
  href: string
  tone: 'neutral' | 'warning' | 'danger'
}) {
  return (
    <Link href={href} className="flex items-center justify-between gap-3 group">
      <span className="text-[13.5px] text-ink-muted group-hover:text-ink">{label}</span>
      <Badge tone={tone}>{value}</Badge>
    </Link>
  )
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
