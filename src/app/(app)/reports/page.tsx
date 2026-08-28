import { requireContext } from '@/server/context'
import { attendanceDate } from '@/lib/dates'
import { formatMoney, formatNumber } from '@/lib/utils'
import { REPORTS } from '@/lib/reports'
import { REPORT_TONE } from '@/lib/chart-tones'
import { scoreSchool } from '@/server/modules/score/service'
import { bandMeta } from '@/lib/score'
import { PageBanner } from '@/components/page-banner'
import { StatCard } from '@/components/dashboard/stat-card'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { HubTile, HubTileGrid } from '@/components/ui/hub-tile'

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
    <div className="space-y-4">
      <PageBanner
        title="Reports & analytics"
        description={
          session
            ? `${session.name} · figures below cover the month to date`
            : 'Figures below cover the month to date'
        }
        tone="attendance"
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Students on roll"
          value={formatNumber(students)}
          icon="Users"
          tone="students"
          sub="Active enrolments"
          href="/reports/enrolment"
          delayMs={40}
        />
        <StatCard
          label="Attendance this month"
          value={rate === null ? 'No data' : `${rate}%`}
          icon="CalendarCheck"
          tone="attendance"
          sub={`${formatNumber(marked)} day-records marked`}
          href="/reports/attendance"
          delayMs={80}
        />
        <StatCard
          label="Collected this month"
          value={formatMoney(collected._sum.amountMinor ?? 0, currency)}
          icon="BadgeIndianRupee"
          tone="fees"
          sub="Payments confirmed"
          href="/reports/collection"
          delayMs={120}
        />
        <StatCard
          label="Outstanding"
          value={formatMoney(outstanding._sum.balanceMinor ?? 0, currency)}
          icon="Wallet"
          tone={(outstanding._sum.balanceMinor ?? 0) > 0 ? 'overdue' : 'pending'}
          sub={`${formatNumber(outstanding._count._all)} invoices unpaid`}
          href="/reports/collection"
          delayMs={160}
        />
        {health && health.score !== null ? (
          <StatCard
            label="Health score"
            value={String(Math.round(health.score * 10) / 10)}
            icon="Activity"
            tone="admissions"
            sub={`${bandMeta(health.band!).label} · ${formatNumber(health.studentsScored)} students scored`}
            href="/score"
            delayMs={200}
          />
        ) : null}
        {canFeedback ? (
          <StatCard
            label="Feedback campaigns"
            value={formatNumber(openCampaigns)}
            icon="MessageSquare"
            tone="parents"
            sub="Active or scheduled"
            href="/feedback"
            delayMs={240}
          />
        ) : null}
      </div>

      <Card variant="elevated" className="overflow-hidden">
        <CardHeader>
          <CardTitle>Analytic reports</CardTitle>
          <span className="text-xs text-ink-subtle">
            Every report exports to CSV and prints
          </span>
        </CardHeader>

        <div className="p-4 pt-0">
          <HubTileGrid>
            {REPORTS.map((report) => (
              <HubTile
                key={report.key}
                href={report.href}
                title={report.title}
                description={report.summary}
                icon={report.icon}
                tone={REPORT_TONE[report.key] ?? 'students'}
              />
            ))}
          </HubTileGrid>
        </div>
      </Card>

      {workingViews.length > 0 ? (
        <Card variant="elevated" className="overflow-hidden">
          <CardHeader>
            <CardTitle>Working views</CardTitle>
            <span className="text-xs text-ink-subtle">
              Day-to-day screens that sit beside the summaries
            </span>
          </CardHeader>
          <div className="p-4 pt-0">
            <HubTileGrid>
              {workingViews.map((link) => (
                <HubTile
                  key={link.href}
                  href={link.href}
                  title={link.label}
                  description={link.note}
                  icon="ArrowUpRight"
                  tone="transport"
                />
              ))}
            </HubTileGrid>
          </div>
        </Card>
      ) : null}
    </div>
  )
}
