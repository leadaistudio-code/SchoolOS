import { differenceInCalendarDays, startOfMonth, subDays } from 'date-fns'
import { attendanceDate, toDateInput } from '@/lib/dates'
import { ApiException } from '@/server/api/response'

/**
 * Every report answers a question about a window of time, and the window has
 * to be the same object on the page, in the CSV and in the heading — so it is
 * parsed once, here, from the query string both of them read.
 */
export type ReportRange = {
  /** Inclusive start, normalised to the calendar-date form the columns use. */
  from: Date
  /** Inclusive end. */
  to: Date
  /** Exclusive end, for comparing against timestamp columns like `paidAt`. */
  toExclusive: Date
  /** The values to write back into the date inputs. */
  fromInput: string
  toInput: string
  label: string
  days: number
}

/** A year is the longest range a report will scan; beyond that it is an export. */
const MAX_DAYS = 400

export function resolveRange(
  params: { from?: string; to?: string },
  fallbackDays = 89,
): ReportRange {
  const today = new Date()
  const toInput = params.to || toDateInput(today)
  const fromInput = params.from || toDateInput(subDays(today, fallbackDays))

  const from = attendanceDate(fromInput)
  const to = attendanceDate(toInput)

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new ApiException(400, 'BAD_REQUEST', 'That is not a valid date')
  }
  if (to < from) {
    throw new ApiException(400, 'BAD_REQUEST', 'The end date is before the start date')
  }
  const days = differenceInCalendarDays(to, from) + 1
  if (days > MAX_DAYS) {
    throw new ApiException(400, 'BAD_REQUEST', 'Choose a range of one year or less')
  }

  const toExclusive = new Date(to)
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1)

  return {
    from,
    to,
    toExclusive,
    fromInput: toDateInput(from),
    toInput: toDateInput(to),
    label: `${toDateInput(from)} to ${toDateInput(to)}`,
    days,
  }
}

/** Presets the range picker offers, resolved server-side so both agree. */
export function rangePresets(): { key: string; label: string; from: string; to: string }[] {
  const today = new Date()
  const to = toDateInput(today)
  return [
    { key: '30d', label: 'Last 30 days', from: toDateInput(subDays(today, 29)), to },
    { key: '90d', label: 'Last 90 days', from: toDateInput(subDays(today, 89)), to },
    { key: 'mtd', label: 'This month', from: toDateInput(startOfMonth(today)), to },
    { key: '12m', label: 'Last 12 months', from: toDateInput(subDays(today, 364)), to },
  ]
}

/**
 * Fills the gaps in a monthly series.
 *
 * A month with no payments has to appear as a zero rather than vanish, or a
 * quiet August reads as a shorter year.
 */
export function monthsBetween(from: Date, to: Date): string[] {
  const keys: string[] = []
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1))
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1))
  while (cursor <= end) {
    keys.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`)
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  return keys
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/** "2026-03" -> "Mar 26". Short enough to sit under a bar. */
export function monthLabel(key: string): string {
  const [year = '', month = ''] = key.split('-')
  return `${MONTH_NAMES[Number(month) - 1] ?? month} ${year.slice(2)}`
}

/** Rounds to one decimal, or null when there was nothing to divide by. */
export function ratio(part: number, whole: number): number | null {
  if (!whole) return null
  return Math.round((part / whole) * 1000) / 10
}
