import * as React from 'react'
import Link from 'next/link'
import { AttendanceRadial, SERIES } from './charts'
import { PanelEmpty } from './panels'
import { formatNumber } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button-variants'

export type AttendanceBreakdown = {
  present: number
  absent: number
  late: number
  halfDay: number
  leave: number
  marked: number
  expected: number
  percent: number
}

/**
 * Today's register at a glance.
 *
 * Labelled "today" rather than offered with a week/month selector, because
 * today is what the underlying figure is: a register that has either been
 * submitted this morning or has not. Historic comparison lives in the
 * attendance reports, which is where the query for it belongs.
 */
export function AttendanceOverview({
  data,
  canMark,
}: {
  data: AttendanceBreakdown
  canMark: boolean
}) {
  if (data.marked === 0) {
    return (
      <PanelEmpty
        title="No register submitted yet"
        description={`${formatNumber(data.expected)} students are expected today. The breakdown appears as teachers mark their classes.`}
        action={
          canMark ? (
            <Link href="/attendance" className={buttonVariants({ size: 'sm' })}>
              Mark attendance
            </Link>
          ) : undefined
        }
      />
    )
  }

  const rows = [
    { label: 'Present', value: data.present, color: SERIES.attendance },
    { label: 'Absent', value: data.absent, color: SERIES.overdue },
    { label: 'Late', value: data.late, color: SERIES.late },
    { label: 'Leave', value: data.leave + data.halfDay, color: SERIES.leave },
  ]

  const unmarked = Math.max(0, data.expected - data.marked)

  return (
    <div>
      <AttendanceRadial percent={data.percent} />

      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2.5">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: row.color }}
              aria-hidden
            />
            <span className="min-w-0">
              <span className="block text-xs text-ink-subtle">{row.label}</span>
              <span className="block text-sm font-semibold tnum text-ink">
                {formatNumber(row.value)}
              </span>
            </span>
          </li>
        ))}
      </ul>

      {unmarked > 0 ? (
        <p className="mt-3 border-t border-line pt-2.5 text-xs text-warning">
          {formatNumber(unmarked)} students still unmarked today.
        </p>
      ) : null}
    </div>
  )
}
