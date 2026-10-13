/**
 * Financial-year arithmetic on calendar dates ("YYYY-MM-DD"). Dates are the
 * school's calendar days, the same convention as `@db.Date` columns and
 * `attendanceDate`, so no time zone enters the comparison.
 *
 * With the default start month of April this agrees with `financialYearRange`
 * in `@/lib/periods`, which the existing reports use.
 */

export const DEFAULT_FY_START_MONTH = 4

export type FiscalYearSpan = { label: string; startsOn: string; endsOn: string }

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/

export function isIsoDate(value: string): boolean {
  const m = ISO.exec(value)
  if (!m) return false
  const d = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

/** Calendar day of a `@db.Date` value or an ISO string. */
export function toIsoDay(value: string | Date): string {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10)
}

function lastDayBefore(year: number, month: number): string {
  // Day 0 of `month` is the last day of the month before it.
  return new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10)
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

/** The financial year that starts in `startYear`. */
export function fiscalYearStartingIn(startYear: number, startMonth = DEFAULT_FY_START_MONTH): FiscalYearSpan {
  if (!Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12) {
    throw new RangeError('Financial year start month must be 1 to 12')
  }
  const startsOn = `${startYear}-${pad(startMonth)}-01`
  if (startMonth === 1) return { label: String(startYear), startsOn, endsOn: `${startYear}-12-31` }
  return {
    label: `${startYear}-${String(startYear + 1).slice(2)}`,
    startsOn,
    endsOn: lastDayBefore(startYear + 1, startMonth),
  }
}

/** The financial year containing `date`. */
export function fiscalYearOf(date: string | Date, startMonth = DEFAULT_FY_START_MONTH): FiscalYearSpan {
  const iso = toIsoDay(date)
  if (!isIsoDate(iso)) throw new RangeError(`Not a calendar date: ${iso}`)
  const year = Number(iso.slice(0, 4))
  const month = Number(iso.slice(5, 7))
  return fiscalYearStartingIn(month >= startMonth ? year : year - 1, startMonth)
}

/** The year containing `today` followed by the `count - 1` years before it. */
export function recentFiscalYears(today: string | Date, count: number, startMonth = DEFAULT_FY_START_MONTH): FiscalYearSpan[] {
  const current = fiscalYearOf(today, startMonth)
  const startYear = Number(current.startsOn.slice(0, 4))
  return Array.from({ length: Math.max(0, count) }, (_, i) => fiscalYearStartingIn(startYear - i, startMonth))
}

export function isWithin(date: string, span: { startsOn: string; endsOn: string }): boolean {
  return date >= span.startsOn && date <= span.endsOn
}

export type FiscalYearState = {
  label: string
  startsOn: string | Date
  endsOn: string | Date
  status: 'OPEN' | 'LOCKED' | 'CLOSED'
  lockedThrough: string | Date | null
}

export type PostingDateCheck =
  | { ok: true; fiscalYear: FiscalYearSpan }
  | { ok: false; code: 'INVALID_DATE' | 'YEAR_CLOSED' | 'PERIOD_LOCKED' | 'NO_FISCAL_YEAR'; message: string }

/**
 * Whether a voucher may be dated `date`, given the school's recorded years.
 *
 * A year with no row is treated as open unless `requireRecordedYear` is set:
 * the existing posting engine predates this table, so absence must not block it.
 */
export function checkPostingDate(
  date: string,
  years: FiscalYearState[],
  options: { startMonth?: number; requireRecordedYear?: boolean } = {},
): PostingDateCheck {
  if (!isIsoDate(date)) return { ok: false, code: 'INVALID_DATE', message: 'Enter a valid voucher date.' }
  const span = fiscalYearOf(date, options.startMonth)
  const row = years.find((y) => isWithin(date, { startsOn: toIsoDay(y.startsOn), endsOn: toIsoDay(y.endsOn) }))
  if (!row) {
    return options.requireRecordedYear
      ? { ok: false, code: 'NO_FISCAL_YEAR', message: `Financial year ${span.label} has not been opened.` }
      : { ok: true, fiscalYear: span }
  }
  if (row.status === 'CLOSED') {
    return { ok: false, code: 'YEAR_CLOSED', message: `Financial year ${row.label} is closed. Post a correction in an open year instead.` }
  }
  const lockedThrough = row.lockedThrough ? toIsoDay(row.lockedThrough) : null
  if (lockedThrough && date <= lockedThrough) {
    return { ok: false, code: 'PERIOD_LOCKED', message: `Books are locked up to ${lockedThrough}. Choose a later date.` }
  }
  return { ok: true, fiscalYear: { label: row.label, startsOn: toIsoDay(row.startsOn), endsOn: toIsoDay(row.endsOn) } }
}
