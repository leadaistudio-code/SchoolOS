import { format } from 'date-fns'

/**
 * Calendar-date handling for `@db.Date` columns.
 *
 * Attendance, leave and due dates are CALENDAR DATES, not instants. Postgres
 * `date` columns come back from Prisma as UTC midnight, so every one of these
 * helpers normalises to UTC midnight and reads back the UTC date parts.
 *
 * Normalising through *local* midnight instead is the classic bug: in a
 * positive-offset zone such as IST, local midnight is 18:30 UTC on the
 * previous day, so a saved register silently lands on the wrong day — and a
 * value already read from the database shifts again every time it is
 * re-normalised.
 */
export function attendanceDate(input: string | Date): Date {
  if (typeof input === 'string') {
    // 'YYYY-MM-DD' is a calendar date; parse it as UTC midnight directly.
    return new Date(`${input.slice(0, 10)}T00:00:00.000Z`)
  }
  // A Date from the database is already UTC midnight; a Date from `new Date()`
  // carries the local wall-clock day, which is the day the user means.
  const isUtcMidnight =
    input.getUTCHours() === 0 &&
    input.getUTCMinutes() === 0 &&
    input.getUTCSeconds() === 0 &&
    input.getUTCMilliseconds() === 0

  return isUtcMidnight
    ? new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()))
    : new Date(Date.UTC(input.getFullYear(), input.getMonth(), input.getDate()))
}

/** Renders a calendar date as 'YYYY-MM-DD' for form inputs and query strings. */
export function toDateInput(d: Date): string {
  return attendanceDate(d).toISOString().slice(0, 10)
}

/**
 * Formats a calendar date for display. Reads the UTC date parts, so the day
 * shown is the day stored — including in negative-offset timezones, where
 * naive local formatting of UTC midnight shows the previous day.
 */
export function formatDay(d: Date, pattern = 'd MMM yyyy'): string {
  const asLocal = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  return format(asLocal, pattern)
}

/** A non-instructional day: no attendance is expected. */
export function isNonWorkingDay(d: Date, holidays: Set<string> = new Set()): boolean {
  const normalised = attendanceDate(d)
  return normalised.getUTCDay() === 0 || holidays.has(toDateInput(normalised))
}

export function isSundayUTC(d: Date): boolean {
  return attendanceDate(d).getUTCDay() === 0
}

/** Inclusive list of calendar dates from `from` to `to`. */
export function eachDateInRange(from: Date, to: Date): Date[] {
  const out: Date[] = []
  const cursor = attendanceDate(from)
  const end = attendanceDate(to)

  while (cursor.getTime() <= end.getTime()) {
    out.push(new Date(cursor))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return out
}

/**
 * Attendance percentage counts late and half-day arrivals as attended, which is
 * how schools report it. Days marked LEAVE or HOLIDAY are excluded from the
 * denominator rather than counted as absences.
 */
export function attendancePercent(counts: Record<string, number | undefined>): number | null {
  const present = (counts.PRESENT ?? 0) + (counts.LATE ?? 0) + (counts.HALF_DAY ?? 0)
  const considered = present + (counts.ABSENT ?? 0)
  if (considered === 0) return null
  return Math.round((present / considered) * 1000) / 10
}
