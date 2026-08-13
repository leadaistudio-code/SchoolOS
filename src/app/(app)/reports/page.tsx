import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { requireContext } from '@/server/context'
import { attendanceDate } from '@/lib/dates'
import { formatMoney, formatNumber } from '@/lib/utils'
import { REPORTS } from '@/lib/reports'
import { PageHeader } from '@/components/page-header'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Metric, MetricRow } from '@/components/ui/metric'
import { Icon } from '@/components/shell/icon'

export const metadata = { title: 'Reports & analytics' }

/**
 * The reports hub.
 *
 * Opens with the four figures a head of school checks before anything else,
 * then lists what can be asked in more depth. The figures are live rather
 * than illustrative, so the hub is useful on its own and the catalogue below
 * it reads as "and here is how to go deeper" rather than as a menu.
 */
export default async function ReportsPage() {
  const ctx = await requireContext('reports.view')
  const currency = ctx.tenant.currency
  const today = attendanceDate(new Date())
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))

  const [students, attendance, collected, outstanding, session] = await Promise.all([
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
    ctx.db.academicSession.findFirst({ where: { isCurrent: true }, select: { name: true } }),
  ])

  const count = (status: string) =>
    attendance.find((a) => a.status === status)?._count._all ?? 0
  const marked =
    count('PRESENT') + count('LATE') + count('HALF_DAY') + count('ABSENT') + count('LEAVE')
  const attended = count('PRESENT') + count('LATE') + count('HALF_DAY')
  const rate = marked > 0 ? Math.round((attended / marked) * 1000) / 10 : null

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
      </MetricRow>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Reports</CardTitle>
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

      <Card className="mt-4 overflow-hidden">
        <CardHeader>
          <CardTitle>Working views</CardTitle>
          <span className="text-xs text-ink-subtle">Day-to-day screens, not summaries</span>
        </CardHeader>
        <ul className="grid gap-px bg-line sm:grid-cols-3">
          {[
            {
              href: '/attendance/reports',
              label: 'Attendance register',
              note: 'Per-student attendance with class and date filters',
            },
            {
              href: '/finance/outstanding',
              label: 'Fee arrears',
              note: 'Chase list with contact details and balances',
            },
            {
              href: '/exams/report-cards',
              label: 'Report cards',
              note: 'Generate and print individual report cards',
            },
          ].map((link) => (
            <li key={link.href} className="bg-surface">
              <Link href={link.href} className="block p-4 transition-colors hover:bg-surface-2">
                <span className="block text-base font-medium text-ink">{link.label}</span>
                <span className="mt-0.5 block text-sm text-ink-muted">{link.note}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
