/**
 * Period maths for scheduled refresher generation.
 *
 * Pulled out of the jobs module so it can be reasoned about — and tested —
 * without loading the database, notification, and AI dependencies the scheduler
 * needs. Everything here is a pure function of its arguments and a timezone
 * string; there is no clock and no I/O. The one job these functions have is to
 * make two runs inside the same period agree on the same boundary, so the
 * idempotency guard never double-creates a teacher's refresher.
 */

/** How many days one period spans, by configured cadence. */
export function periodDaysFor(frequency: string): number {
  switch (frequency) {
    case 'BIWEEKLY':
      return 14
    case 'MONTHLY':
      return 30
    case 'WEEKLY':
    case 'CUSTOM':
    default:
      return 7
  }
}

/**
 * The instant that begins the current period, in the school's timezone.
 *
 * For a weekly cadence this is local midnight at the start of the current ISO
 * week (Monday); for longer cadences it is simply `periodDays` before now,
 * floored to local midnight. Precise to the day, which is all a de-duplication
 * guard needs — the exact second does not matter, only that two runs in the
 * same period agree on the same boundary.
 */
export function periodStart(now: Date, periodDays: number, timeZone: string): Date {
  const offset = tzOffsetMs(now, timeZone)
  // A Date whose UTC fields read as the school's local wall clock.
  const local = new Date(now.getTime() + offset)

  if (periodDays === 7) {
    const day = local.getUTCDay() // 0 = Sunday
    const daysSinceMonday = (day + 6) % 7
    local.setUTCDate(local.getUTCDate() - daysSinceMonday)
  } else {
    local.setUTCDate(local.getUTCDate() - periodDays)
  }
  local.setUTCHours(0, 0, 0, 0)

  // Back to a real UTC instant.
  return new Date(local.getTime() - offset)
}

/** The school's UTC offset in milliseconds at `date`. */
function tzOffsetMs(date: Date, timeZone: string): number {
  const utc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }))
  const local = new Date(date.toLocaleString('en-US', { timeZone }))
  return local.getTime() - utc.getTime()
}
