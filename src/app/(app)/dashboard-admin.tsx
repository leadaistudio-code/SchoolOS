import Link from 'next/link'
import { format } from 'date-fns'
import { requireContext } from '@/server/context'
import { getAdminDashboard } from '@/server/modules/dashboard/service'
import { transportDashboard } from '@/server/modules/transport/service'
import { formatMoney, formatNumber } from '@/lib/utils'
import { WelcomeBanner } from '@/components/dashboard/welcome-banner'
import { StatCard } from '@/components/dashboard/stat-card'
import { Widget, WidgetLink } from '@/components/dashboard/widget'
import { WidgetBoundary } from '@/components/dashboard/widget-boundary'
import { AcademicOverview } from '@/components/dashboard/academic-overview'
import { AttendanceOverview } from '@/components/dashboard/attendance-overview'
import { AdmissionsBanner } from '@/components/dashboard/admissions-banner'
import { QuickActions, QUICK_ACTIONS } from '@/components/dashboard/quick-actions'
import { DonutChart, SERIES } from '@/components/dashboard/charts'
import {
  FeeLegend,
  InquiriesSnapshot,
  RecentActivity,
  StaffDirectory,
  TransportSnapshot,
  UpcomingEvents,
  type UpcomingItem,
} from '@/components/dashboard/panels'
import { AttentionRow } from '@/components/dashboard/attention-row'

/**
 * The administrator's dashboard.
 *
 * Ordered by the questions a head teacher asks on the way in: how many
 * children do we have, were they here, has the money arrived, what needs
 * doing, and is anything on fire. Everything below that line is context.
 *
 * This file composes; it does not render. Each panel is its own component so
 * the arrangement can be reordered — or varied by role later — without editing
 * the widgets themselves.
 */
export async function AdminDashboard() {
  const ctx = await requireContext('dashboard.view')
  const data = await getAdminDashboard(ctx)
  const currency = ctx.tenant.currency
  const schoolName = ctx.tenant.school?.name ?? ctx.tenant.name

  // Transport is optional: not every school buys the module, and a school
  // without it should not see an empty strip where a fleet would be.
  const transport = ctx.can('transport.view') ? await transportDashboard(ctx) : null

  const actions = QUICK_ACTIONS.filter((action) => ctx.can(action.permission))
  const unmarked = Math.max(0, data.attendance.expected - data.attendance.marked)

  const headline = data.attendance.marked
    ? `Attendance is ${data.attendance.percent}% today and ${formatMoney(data.finance.collectedTodayMinor, currency)} has been collected.`
    : `${formatNumber(data.attendance.expected)} students are expected today. No register has been submitted yet.`

  const upcoming: UpcomingItem[] = [
    ...data.upcomingExams
      .filter((exam) => exam.startsOn)
      .map((exam) => ({
        id: exam.id,
        title: exam.name,
        kind: 'Examination',
        at: exam.startsOn!,
        href: '/exams',
      })),
    ...data.upcomingEvents.map((event) => ({
      id: event.id,
      title: event.title,
      kind: event.kind,
      at: event.startsAt,
      href: '/academics/calendar',
    })),
  ]
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, 5)

  return (
    <div className="space-y-4">
      <WelcomeBanner
        firstName={ctx.user.firstName}
        schoolName={schoolName}
        headline={headline}
        action={
          unmarked > 0 && ctx.can('attendance.mark')
            ? { label: 'Mark attendance', href: '/attendance' }
            : undefined
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total students"
          value={formatNumber(data.people.students)}
          icon="GraduationCap"
          tone="students"
          href="/students"
          changePercent={data.people.growth.students.changePercent}
          sub={`${formatNumber(data.people.teachers)} teachers on staff`}
          series={data.people.growth.students.series}
          delayMs={0}
        />
        <StatCard
          label="Total staff"
          value={formatNumber(data.people.staff)}
          icon="Briefcase"
          tone="staff"
          href="/staff"
          changePercent={data.people.growth.staff.changePercent}
          sub={`${formatNumber(data.people.staff - data.people.teachers)} non-teaching`}
          series={data.people.growth.staff.series}
          delayMs={40}
        />
        <StatCard
          label="Total parents"
          value={formatNumber(data.people.parents)}
          icon="Users2"
          tone="parents"
          href="/parents"
          changePercent={data.people.growth.parents.changePercent}
          sub="Guardians with a portal account"
          series={data.people.growth.parents.series}
          delayMs={80}
        />
        <StatCard
          label="Attendance today"
          value={data.attendance.marked ? `${data.attendance.percent}%` : '—'}
          icon="CalendarCheck"
          tone="attendance"
          href="/attendance"
          sub={
            data.attendance.marked
              ? `${formatNumber(data.attendance.present)} present · ${formatNumber(data.attendance.absent)} absent`
              : 'Register not submitted'
          }
          delayMs={120}
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <WidgetBoundary title="Academic overview">
          <Widget
            title="Academic overview"
            subtitle="Head count and attendance by month"
            action={<WidgetLink href="/attendance/reports">Reports</WidgetLink>}
            delayMs={60}
          >
            <AcademicOverview data={data.academic} />
          </Widget>
        </WidgetBoundary>

        <div className="flex flex-col gap-3">
          <WidgetBoundary title="Fee collection">
            <Widget
              title="Fee collection"
              subtitle="Across all issued invoices"
              action={<WidgetLink href="/finance">Finance</WidgetLink>}
              delayMs={100}
            >
              <div className="grid items-center gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <DonutChart
                  height={168}
                  centerValue={formatMoney(data.finance.billing.collectedMinor, currency)}
                  centerLabel="Collected"
                  currency={currency}
                  slices={[
                    { key: 'collected', label: 'Collected', value: data.finance.billing.collectedMinor, color: SERIES.attendance },
                    { key: 'pending', label: 'Pending', value: data.finance.billing.pendingMinor, color: SERIES.pending },
                    { key: 'overdue', label: 'Overdue', value: data.finance.billing.overdueMinor, color: SERIES.overdue },
                  ]}
                />
                <FeeLegend
                  currency={currency}
                  rows={[
                    { label: 'Collected', amountMinor: data.finance.billing.collectedMinor, color: SERIES.attendance },
                    { label: 'Pending', amountMinor: data.finance.billing.pendingMinor, color: SERIES.pending },
                    { label: 'Overdue', amountMinor: data.finance.billing.overdueMinor, color: SERIES.overdue },
                  ]}
                />
              </div>
            </Widget>
          </WidgetBoundary>

          {ctx.can('admissions.view') ? (
            <AdmissionsBanner
              thisWeek={data.admissions.thisWeek}
              openLeads={data.admissions.open}
              sessionLabel={null}
            />
          ) : null}
        </div>
      </div>

      {actions.length > 0 ? (
        <div>
          <h2 className="caption mb-2">Quick actions</h2>
          <QuickActions actions={actions} />
        </div>
      ) : null}

      <AttentionRow
        rows={[
          { label: 'Students not marked today', value: unmarked, href: '/attendance', icon: 'CalendarCheck' },
          { label: 'Invoices past due', value: data.finance.overdueInvoices, href: '/finance/outstanding', icon: 'ReceiptText' },
          { label: 'Leave requests to approve', value: data.pendingLeave, href: '/leave', icon: 'CalendarOff' },
          { label: 'Library books overdue', value: data.library.overdue, href: '/library', icon: 'Library' },
        ]}
      />

      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        <WidgetBoundary title="Recent activity">
          <Widget
            title="Recent activity"
            action={
              ctx.can('audit.view') ? <WidgetLink href="/settings">Audit log</WidgetLink> : undefined
            }
            delayMs={40}
          >
            <RecentActivity rows={data.recentActivity} />
          </Widget>
        </WidgetBoundary>

        <WidgetBoundary title="Attendance today">
          <Widget
            title="Attendance today"
            subtitle={format(new Date(), 'EEEE d MMMM')}
            action={<WidgetLink href="/attendance">Register</WidgetLink>}
            delayMs={80}
          >
            <AttendanceOverview
              data={{
                present: data.attendance.present,
                absent: data.attendance.absent,
                late: data.attendance.late,
                halfDay: data.attendance.halfDay,
                leave: data.attendance.leave,
                marked: data.attendance.marked,
                expected: data.attendance.expected,
                percent: data.attendance.percent,
              }}
              canMark={ctx.can('attendance.mark')}
            />
          </Widget>
        </WidgetBoundary>

        <WidgetBoundary title="Upcoming">
          <Widget
            title="Upcoming"
            action={<WidgetLink href="/academics/calendar">Calendar</WidgetLink>}
            delayMs={120}
          >
            <UpcomingEvents items={upcoming} />
          </Widget>
        </WidgetBoundary>
      </div>

      {ctx.can('staff.view') ? (
        <WidgetBoundary title="Staff directory">
          <Widget
            title="Staff directory"
            subtitle={`${formatNumber(data.people.staff)} people on the roll`}
            action={<WidgetLink href="/staff">All staff</WidgetLink>}
            delayMs={40}
          >
            <StaffDirectory rows={data.staffDirectory} />
          </Widget>
        </WidgetBoundary>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        {transport ? (
          <WidgetBoundary title="Transport">
            <Widget
              title="Transport"
              subtitle="Live fleet status"
              action={
                ctx.can('transport.track') ? (
                  <WidgetLink href="/transport/tracking">Live map</WidgetLink>
                ) : (
                  <WidgetLink href="/transport">Transport</WidgetLink>
                )
              }
              delayMs={40}
            >
              <TransportSnapshot
                rows={transport.rows}
                running={transport.running}
                noSignal={transport.noSignal}
                riders={transport.riders}
              />
            </Widget>
          </WidgetBoundary>
        ) : null}

        {ctx.can('admissions.view') ? (
          <WidgetBoundary title="Latest enquiries">
            <Widget
              title="Latest enquiries"
              subtitle={`${formatNumber(data.admissions.open)} open`}
              delayMs={80}
            >
              <InquiriesSnapshot rows={data.admissions.leads} />
            </Widget>
          </WidgetBoundary>
        ) : null}
      </div>

      {ctx.can('fees.view') ? (
        <WidgetBoundary title="Recent payments">
          <Widget
            title="Recent payments"
            subtitle={`${formatMoney(data.finance.collectedMonthMinor, currency)} collected this month`}
            action={<WidgetLink href="/finance/payments">All payments</WidgetLink>}
            delayMs={40}
            bodyClassName="px-4 py-1"
          >
            {data.recentPayments.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink-muted">No payments recorded yet.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {data.recentPayments.map((payment) => (
                  <li key={payment.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <Link
                        href={`/students/${payment.student.id}`}
                        className="block truncate text-sm text-ink hover:text-[var(--product-600)]"
                      >
                        {payment.student.firstName} {payment.student.lastName}
                      </Link>
                      <p className="text-xs text-ink-subtle">
                        {payment.student.admissionNo} · {payment.mode.replaceAll('_', ' ').toLowerCase()}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tnum text-ink">
                      {formatMoney(payment.amountMinor, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Widget>
        </WidgetBoundary>
      ) : null}
    </div>
  )
}
