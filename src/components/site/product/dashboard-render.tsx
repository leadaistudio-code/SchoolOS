import * as React from 'react'
import { StatCard } from '@/components/dashboard/stat-card'
import { Widget } from '@/components/dashboard/widget'
import { AcademicOverview } from '@/components/dashboard/academic-overview'
import { AttendanceOverview } from '@/components/dashboard/attendance-overview'
import { DonutChart, SERIES } from '@/components/dashboard/charts'
import { FeeLegend } from '@/components/dashboard/panels'
import { formatMoney } from '@/lib/utils'

/**
 * The dashboard, rendered rather than photographed.
 *
 * These are the application's own components — the same StatCard, the same
 * charts, the same widget frame the product ships. Nothing here is a mockup:
 * if the product's dashboard changes, this changes with it, and it stays sharp
 * at any width instead of being a screenshot taken at one.
 *
 * The figures are illustrative sample data for a school of about 1,300
 * students. They are not a customer's numbers and the page never presents them
 * as one.
 */

const MONTHS = [
  { label: 'Apr', students: 1187, staff: 84, attendance: 93 },
  { label: 'May', students: 1201, staff: 86, attendance: 91 },
  { label: 'Jun', students: 1218, staff: 88, attendance: 94 },
  { label: 'Jul', students: 1256, staff: 91, attendance: 95 },
  { label: 'Aug', students: 1271, staff: 93, attendance: 94 },
  { label: 'Sep', students: 1284, staff: 94, attendance: 96 },
]

const STUDENT_SERIES = MONTHS.map((m) => ({ label: m.label, value: m.students }))

export function DashboardRender({ compact }: { compact?: boolean }) {
  const currency = 'INR'

  return (
    <div className="bg-[var(--page)] p-3 sm:p-5">
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <StatCard
          label="Total students"
          value="1,284"
          icon="GraduationCap"
          tone="students"
          changePercent={1.0}
          sub="94 teachers on staff"
          series={STUDENT_SERIES}
        />
        <StatCard
          label="Attendance today"
          value="94.2%"
          icon="CalendarCheck"
          tone="attendance"
          sub="1,210 present · 74 absent"
        />
        <StatCard
          label="Collected this month"
          value={formatMoney(1840000_00, currency)}
          icon="Wallet"
          tone="fees"
          changePercent={8.4}
          sub="212 payments"
        />
        <StatCard
          label="Outstanding"
          value={formatMoney(420000_00, currency)}
          icon="ReceiptText"
          tone="overdue"
          changePercent={-12.5}
          goodWhenUp={false}
          sub="22 families past due"
        />
      </div>

      {!compact ? (
        <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
          <Widget title="Academic overview" subtitle="Head count and attendance by month">
            <AcademicOverview data={MONTHS} />
          </Widget>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <Widget title="Fee collection" subtitle="Across all issued invoices">
              <div className="grid items-center gap-2">
                <DonutChart
                  height={150}
                  currency={currency}
                  centerValue={formatMoney(1840000_00, currency)}
                  centerLabel="Collected"
                  slices={[
                    { key: 'c', label: 'Collected', value: 1840000_00, color: SERIES.attendance },
                    { key: 'p', label: 'Pending', value: 640000_00, color: SERIES.pending },
                    { key: 'o', label: 'Overdue', value: 420000_00, color: SERIES.overdue },
                  ]}
                />
                <FeeLegend
                  currency={currency}
                  rows={[
                    { label: 'Collected', amountMinor: 1840000_00, color: SERIES.attendance },
                    { label: 'Pending', amountMinor: 640000_00, color: SERIES.pending },
                    { label: 'Overdue', amountMinor: 420000_00, color: SERIES.overdue },
                  ]}
                />
              </div>
            </Widget>

            <Widget title="Attendance today" subtitle="Monday 11 August" className="hidden sm:flex xl:hidden">
              <AttendanceOverview
                canMark={false}
                data={{
                  present: 1210,
                  absent: 74,
                  late: 31,
                  halfDay: 0,
                  leave: 18,
                  marked: 1284,
                  expected: 1284,
                  percent: 94,
                }}
              />
            </Widget>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** Just the register ring and its breakdown, for tighter compositions. */
export function AttendanceRender() {
  return (
    <Widget title="Attendance today" subtitle="Monday 11 August">
      <AttendanceOverview
        canMark={false}
        data={{
          present: 1210,
          absent: 74,
          late: 31,
          halfDay: 0,
          leave: 18,
          marked: 1284,
          expected: 1284,
          percent: 94,
        }}
      />
    </Widget>
  )
}
