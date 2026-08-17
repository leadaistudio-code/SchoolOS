import * as React from 'react'
import { CalendarCheck, GraduationCap, ReceiptText, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { Widget } from '@/components/dashboard/widget'
import { formatMoney } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { CHART, MiniColumns, MiniDonut, MiniLegend, MiniRing, MiniSparkline, type ChartTone } from './mini-charts'

/**
 * The dashboard, rendered rather than photographed.
 *
 * It is built from the application's own frame (`Widget`), its own tokens and
 * its own layout, so a change to the product's visual language reaches the
 * website too. What it does *not* use is the application's chart components or
 * its dynamic icon resolver: between them those pulled Recharts and the entire
 * Lucide icon set — about 250 kB of gzipped JavaScript — into a page whose
 * charts nobody can interact with. Here the figures are inline SVG and the four
 * icons are imported by name, so this composition ships no JavaScript.
 *
 * The figures are illustrative sample data for a school of about 1,300
 * students. They are not a customer's numbers and the site says so wherever this
 * appears.
 */

const MONTHS = [
  { label: 'Apr', students: 1187, attendance: 93 },
  { label: 'May', students: 1201, attendance: 91 },
  { label: 'Jun', students: 1218, attendance: 94 },
  { label: 'Jul', students: 1256, attendance: 95 },
  { label: 'Aug', students: 1271, attendance: 94 },
  { label: 'Sep', students: 1284, attendance: 96 },
]

const COLLECTED = 1840000_00
const PENDING = 640000_00
const OVERDUE = 420000_00

/**
 * Which part of the screen to show.
 *
 * The homepage shows the whole dashboard at the fold and then, further down, the
 * reporting half on its own at a larger size. Without this split the two
 * compositions were the same picture twice, which reads as padding.
 */
export function DashboardRender({ view = 'all' }: { view?: 'all' | 'kpis' | 'charts' }) {
  const currency = 'INR'

  /*
   * Container queries, not viewport ones.
   *
   * This composition is dropped into columns of very different widths — the
   * full width of the product page, half of the homepage hero, a 600px column
   * beside the three products. Breaking on the viewport meant a 600px panel
   * still went to four stat tiles across as soon as the WINDOW passed 1280,
   * and the money figures were clipped mid-digit. Every break below is against
   * this element's own width instead, so the panel lays itself out correctly
   * wherever it is put and no caller has to pass a size.
   */
  return (
    <div className="@container bg-[var(--page)] p-3 sm:p-5">
      {view === 'charts' ? null : (
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 @[46rem]:grid-cols-4">
          <StatTile
            label="Total students"
            value="1,284"
            icon={GraduationCap}
            tone="students"
            changePercent={1.0}
            sub="94 teachers on staff"
            series={MONTHS.map((month) => month.students)}
          />
          <StatTile
            label="Attendance today"
            value="94.2%"
            icon={CalendarCheck}
            tone="attendance"
            sub="1,210 present · 74 absent"
          />
          <StatTile
            label="Collected this month"
            value={formatMoney(COLLECTED, currency)}
            icon={Wallet}
            tone="fees"
            changePercent={8.4}
            sub="212 payments"
          />
          <StatTile
            label="Outstanding"
            value={formatMoney(OVERDUE, currency)}
            icon={ReceiptText}
            tone="overdue"
            changePercent={-12.5}
            goodWhenUp={false}
            sub="22 families past due"
          />
        </div>
      )}

      {view !== 'kpis' ? (
        <div
          className={cn(
            'grid gap-3 @[52rem]:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]',
            view === 'all' && 'mt-3',
          )}
        >
          <Widget title="Academic overview" subtitle="Head count and attendance by month">
            <MiniColumns
              data={MONTHS.map((month) => ({
                label: month.label,
                bar: month.students,
                line: month.attendance,
              }))}
            />
            <MiniLegend
              className="mt-3 flex gap-5 space-y-0"
              items={[
                { label: 'Students', tone: 'students' },
                { label: 'Attendance %', tone: 'attendance' },
              ]}
            />
          </Widget>

          <div className="grid gap-3 @[34rem]:grid-cols-2 @[52rem]:grid-cols-1">
            <Widget title="Fee collection" subtitle="Across all issued invoices">
              <MiniDonut
                centreValue={formatMoney(COLLECTED, currency)}
                centreLabel="Collected"
                slices={[
                  { label: 'Collected', value: COLLECTED, tone: 'attendance' },
                  { label: 'Pending', value: PENDING, tone: 'pending' },
                  { label: 'Overdue', value: OVERDUE, tone: 'overdue' },
                ]}
              />
              <MiniLegend
                className="mt-3"
                items={[
                  { label: 'Collected', value: formatMoney(COLLECTED, currency), tone: 'attendance' },
                  { label: 'Pending', value: formatMoney(PENDING, currency), tone: 'pending' },
                  { label: 'Overdue', value: formatMoney(OVERDUE, currency), tone: 'overdue' },
                ]}
              />
            </Widget>

            {/* In the full dashboard this panel duplicates the attendance
                figure in the band above once there is room for both, so it is
                dropped once the panel is wide. In the reporting-only view it is
                the fourth panel and always shown. */}
            <div className={view === 'charts' ? 'block' : 'hidden @[34rem]:block @[52rem]:hidden'}>
              <AttendanceRender />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** Today's register, as the application shows it. */
export function AttendanceRender() {
  return (
    <Widget title="Attendance today" subtitle="Monday 11 August">
      <MiniRing percent={94} label="94%" sub="1,210 of 1,284" />
      <MiniLegend
        className="mt-4"
        items={[
          { label: 'Present', value: '1,210', tone: 'attendance' },
          { label: 'Absent', value: '74', tone: 'overdue' },
          { label: 'Late', value: '31', tone: 'late' },
          { label: 'Leave', value: '18', tone: 'leave' },
        ]}
      />
    </Widget>
  )
}

/**
 * A headline figure with its context.
 *
 * Mirrors the application's `StatCard` — same `widget` frame, same type scale,
 * same tinted icon — without its dynamic icon lookup. The icon arrives as a
 * component so only the four in use are bundled.
 */
function StatTile({
  label,
  value,
  icon: IconComponent,
  tone,
  sub,
  changePercent,
  changeLabel = 'since last month',
  goodWhenUp = true,
  series,
}: {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
  tone: ChartTone
  sub?: string
  changePercent?: number
  changeLabel?: string
  goodWhenUp?: boolean
  series?: number[]
}) {
  const up = (changePercent ?? 0) >= 0
  const good = goodWhenUp ? up : !up
  const Trend = up ? TrendingUp : TrendingDown

  return (
    <div className="widget block p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-ink-muted">{label}</p>
          <p className="tnum mt-1.5 text-3xl font-semibold leading-none text-ink">{value}</p>
        </div>
        <span
          className="grid size-10 shrink-0 place-items-center rounded-[12px]"
          style={{
            background: `color-mix(in srgb, ${CHART[tone]} 12%, transparent)`,
            color: CHART[tone],
          }}
        >
          <IconComponent className="size-5" />
        </span>
      </div>

      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {changePercent !== undefined ? (
            <p
              className={cn(
                'tnum flex items-center gap-1 text-xs font-semibold',
                good ? 'text-success' : 'text-[var(--danger)]',
              )}
            >
              <Trend className="size-3.5" aria-hidden />
              {up ? '+' : '−'}
              {Math.abs(changePercent)}%
              <span className="font-normal text-ink-subtle">{changeLabel}</span>
            </p>
          ) : null}
          {sub ? <p className="mt-0.5 truncate text-xs text-ink-subtle">{sub}</p> : null}
        </div>

        {series && series.length > 1 ? (
          <div className="w-24 shrink-0 sm:w-28">
            <MiniSparkline data={series} tone={tone} />
          </div>
        ) : null}
      </div>
    </div>
  )
}
