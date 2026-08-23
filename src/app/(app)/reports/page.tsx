import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { requireContext } from '@/server/context'
import { attendanceDate } from '@/lib/dates'
import { formatMoney, formatNumber } from '@/lib/utils'
import { REPORTS } from '@/lib/reports'
import { scoreSchool } from '@/server/modules/score/service'
import { bandMeta } from '@/lib/score'
import { PageHeader } from '@/components/page-header'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Metric, MetricRow } from '@/components/ui/metric'
import { Icon } from '@/components/shell/icon'

export const metadata = { title: 'Reports & analytics' }

/**
 * The reports hub.
 *
 * Opens with the figures a head of school checks before anything else —
 * including the health score when they can see it — then lists every analytic
 * report and the day-to-day working views that sit beside them.
 */
export default async function ReportsPage() {
  const ctx = await requireContext('reports.view')
  const currency = ctx.tenant.currency
  const today = attendanceDate(new Date())
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
  const canScore = ctx.can('score.view')
  const canFeedback = ctx.can('feedback.view')

  const [students, attendance, collected, outstanding, session, health, openCampaigns] =
    await Promise.all([
      ctx.db.student.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      ctx.db.studentAttendance.groupBy({
        by: ['status'],
        where: { onDate: { gte: monthStart, lte: today } },
        _count: { _all: true },
      }),
      ctx.db.feePayment.aggregate({
        where: { status: 'SUCCESS', paidAt: { gte: monthStart } },
        _sum: { amountMinor: true },
      }),
      ctx.db.feeInvoice.aggregate({
        where: { cancelledAt: null, balanceMinor: { gt: 0 } },
        _sum: { balanceMinor: true },
        _count: { _all: true },
      }),
      ctx.db.academicSession.findFirst({
        where: { isCurrent: true },
        select: { name: true },
      }),
      canScore ? scoreSchool(ctx).catch(() => null) : Promise.resolve(null),
      canFeedback
        ? ctx.db.feedbackCampaign.count({
            where: { status: { in: ['ACTIVE', 'SCHEDULED'] } },
          })
        : Promise.resolve(0),
    ])

  const count = (status: string) =>
    attendance.find((a) => a.status === status)?._count._all ?? 0
  const marked =
    count('PRESENT') + count('LATE') + count('HALF_DAY') + count('ABSENT') + count('LEAVE')
  const attended = count('PRESENT') + count('LATE') + count('HALF_DAY')
  const rate = marked > 0 ? Math.round((attended / marked) * 1000) / 10 : null

  const workingViews = [
    {
      href: '/attendance/reports',
      label: 'Attendance register',
      note: 'Per-student attendance with class and date filters',
      show: ctx.can('attendance.report'),
    },
    {
      href: '/finance/outstanding',
      label: 'Fee arrears',
      note: 'Chase list with contact details and balances',
      show: ctx.can('fees.view'),
    },
    {
      href: '/exams/report-cards',
      label: 'Report cards',
      note: 'Generate and print individual report cards',
      show: ctx.can('exams.view'),
    },
    {
      href: '/score',
      label: 'Health score',
      note: 'School, class and student scores from live records',
      show: canScore,
    },
    {
      href: '/feedback',
      label: 'Feedback campaigns',
      note: 'Parent and teacher feedback with moderation',
      show: canFeedback,
    },
    {
      href: '/library/loans',
      label: 'Library loans',
      note: 'Books out, overdue and returns',
      show: ctx.can('library.view'),
    },
  ].filter((link) => link.show)

  return (
    <div>
      <PageHeader
        title="Reports & analytics"
        description={
          session
            ? `${session.name} · figures below cover the month to date`
            : 'Figures below cover the month to date'
        }
        breadcrumbs={[{ label: 'Reports' }]}
      />

      <MetricRow className="mb-5">
        <Metric
          label="Students on roll"
          value={formatNumber(students)}
          sub="Active enrolments"
          href="/reports/enrolment"
        />
        <Metric
          label="Attendance this month"
          value={rate === null ? 'No data' : `${rate}%`}
          sub={`${formatNumber(marked)} day-records marked`}
          emphasis={rate !== null && rate < 85 ? 'warning' : undefined}
          href="/reports/attendance"
        />
        <Metric
          label="Collected this month"
          value={formatMoney(collected._sum.amountMinor ?? 0, currency)}
          sub="Payments confirmed"
          href="/reports/collection"
        />
        <Metric
          label="Outstanding"
          value={formatMoney(outstanding._sum.balanceMinor ?? 0, currency)}
          sub={`${formatNumber(outstanding._count._all)} invoices unpaid`}
          emphasis={(outstanding._sum.balanceMinor ?? 0) > 0 ? 'warning' : undefined}
          href="/reports/collection"
        />
        {health && health.score !== null ? (
          <Metric
            label="Health score"
            value={String(Math.round(health.score * 10) / 10)}
            sub={`${bandMeta(health.band!).label} · ${formatNumber(health.studentsScored)} students scored`}
            href="/score"
          />
        ) : null}
        {canFeedback ? (
          <Metric
            label="Feedback campaigns"
            value={formatNumber(openCampaigns)}
            sub="Active or scheduled"
            href="/feedback"
          />
        ) : null}
      </MetricRow>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Analytic reports</CardTitle>
          <span className="text-xs text-ink-subtle">
            Every report exports to CSV and prints
          </span>
        </CardHeader>

        <ul className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-3">
          {REPORTS.map((report) => (
            <li key={report.key} className="bg-surface">
              <Link
                href={report.href}
                className="group flex h-full gap-3 p-4 transition-colors hover:bg-surface-2"
              >
                <span
                  className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-[var(--product-50)] text-[var(--product-600)]"
                  aria-hidden
                >
                  <Icon name={report.icon} className="size-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-base font-medium text-ink">
                    {report.title}
                    <ArrowRight
                      className="size-3.5 text-ink-subtle transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </span>
                  <span className="mt-0.5 block text-sm text-ink-muted">{report.summary}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      {workingViews.length > 0 ? (
        <Card className="mt-4 overflow-hidden">
          <CardHeader>
            <CardTitle>Working views</CardTitle>
            <span className="text-xs text-ink-subtle">
              Day-to-day screens that sit beside the summaries
            </span>
          </CardHeader>
          <ul className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
            {workingViews.map((link) => (
              <li key={link.href} className="bg-surface">
                <Link href={link.href} className="block p-4 transition-colors hover:bg-surface-2">
                  <span className="block text-base font-medium text-ink">{link.label}</span>
                  <span className="mt-0.5 block text-sm text-ink-muted">{link.note}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  )
}
