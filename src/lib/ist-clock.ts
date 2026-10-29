import { format } from 'date-fns'

const IST_OFFSET_MS = 330 * 60_000

export type IstClock = {
  /** Calendar date in India, YYYY-MM-DD. */
  iso: string
  /** Minutes since midnight in India. */
  minutes: number
  /** 1 = Monday … 7 = Sunday, matching TimetableSlot.dayOfWeek. */
  weekday: number
}

export function istClock(now: Date = new Date()): IstClock {
  const ist = new Date(now.getTime() + IST_OFFSET_MS)
  const day = ist.getUTCDay()
  return {
    iso: ist.toISOString().slice(0, 10),
    minutes: ist.getUTCHours() * 60 + ist.getUTCMinutes(),
    weekday: day === 0 ? 7 : day,
  }
}

/** UTC instant of 00:00 IST on a YYYY-MM-DD calendar date. */
export function istDayStart(iso: string): Date {
  return new Date(Date.parse(`${iso.slice(0, 10)}T00:00:00.000Z`) - IST_OFFSET_MS)
}

/** Weekday (1 = Monday … 7 = Sunday) of a YYYY-MM-DD calendar date. */
export function weekdayOf(iso: string): number {
  const day = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`).getUTCDay()
  return day === 0 ? 7 : day
}

/** "HH:mm" → minutes since midnight; null when malformed. */
export function minutesOf(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

export function shiftIso(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Monday of the week containing `iso`. */
export function weekStartIso(iso: string): string {
  return shiftIso(iso, 1 - weekdayOf(iso))
}

/**
 * Form input → instant, reading wall-clock values as India time whatever the
 * server zone is. Accepts "2026-10-29", "2026-10-29T11:00" (datetime-local) or
 * a full ISO string with its own zone, which is kept as is. A date alone gets
 * `defaultTime`. Returns null when unparseable.
 */
export function istDateTime(date: string, time?: string | null, defaultTime = '10:00'): Date | null {
  const value = date.trim()
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(value) && value.includes('T')) {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const [day, inlineTime] = value.split('T')
  const hhmm = (time?.trim() || inlineTime?.slice(0, 5) || defaultTime).slice(0, 5)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day ?? '') || minutesOf(hhmm) === null) return null
  const d = new Date(`${day}T${hhmm.padStart(5, '0')}:00.000+05:30`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** date-fns `format`, but always in India time (server runs in UTC). */
export function formatIst(at: Date | string | number, pattern: string): string {
  const d = new Date(at)
  return format(new Date(d.getTime() + IST_OFFSET_MS + d.getTimezoneOffset() * 60_000), pattern)
}

/** "Sat, 3 Oct" for messages. */
export function shortDayLabel(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}
