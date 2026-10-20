/**
 * Leaderboard periods.
 *
 * One timezone for the whole global board — otherwise "today" would end at
 * different moments for different schools and the daily ranking would compare
 * unequal days. Weeks are ISO weeks (Monday start).
 */

export const DEFAULT_LEADERBOARD_TIMEZONE = 'Asia/Kolkata'

export type PeriodKeys = { ALL_TIME: string; DAILY: string; WEEKLY: string; MONTHLY: string }

/** Calendar date (YYYY-MM-DD) of an instant in a timezone. */
export function localDate(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** ISO-8601 week key, e.g. 2026-W43, for a YYYY-MM-DD date. */
export function isoWeekKey(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  const day = (d.getUTCDay() + 6) % 7 // Monday = 0
  d.setUTCDate(d.getUTCDate() - day + 3) // Thursday of this week decides the year
  const weekYear = d.getUTCFullYear()
  const firstThursday = new Date(Date.UTC(weekYear, 0, 4))
  const firstDay = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3)
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86_400_000))
  return `${weekYear}-W${String(week).padStart(2, '0')}`
}

export function periodKeys(at: Date, timeZone: string = DEFAULT_LEADERBOARD_TIMEZONE): PeriodKeys {
  const day = localDate(at, timeZone)
  return { ALL_TIME: 'all', DAILY: day, WEEKLY: isoWeekKey(day), MONTHLY: day.slice(0, 7) }
}

/** Monday (YYYY-MM-DD) of the ISO week containing `date`. */
export function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

/** Shifts a YYYY-MM-DD date by whole days. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * The instant a local calendar day starts in a timezone. Found by correcting
 * a UTC guess with the zone's offset at that moment, which is exact for zones
 * without a DST jump at midnight (all Indian zones, and almost all others).
 */
export function startOfLocalDay(date: string, timeZone: string): Date {
  const guess = new Date(`${date}T00:00:00Z`)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(guess)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0')
  const localAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  const offsetMs = localAsUtc - guess.getTime()
  return new Date(guess.getTime() - offsetMs)
}

/**
 * Consecutive days with focus, ending today or yesterday. Missing today does
 * not break a streak until the day is over — nobody loses a streak at 8am.
 */
export function currentStreak(activeDays: Iterable<string>, today: string): number {
  const set = new Set(activeDays)
  let cursor = set.has(today) ? today : addDays(today, -1)
  let streak = 0
  while (set.has(cursor)) {
    streak += 1
    cursor = addDays(cursor, -1)
  }
  return streak
}
