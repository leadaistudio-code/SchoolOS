/**
 * Shared chart / KPI colour tokens.
 *
 * Dashboard StatCards, hub tiles and module banners all read from here so a
 * series keeps the same meaning everywhere in the app.
 */
export const SERIES_KEYS = [
  'students',
  'staff',
  'parents',
  'attendance',
  'fees',
  'pending',
  'overdue',
  'admissions',
  'transport',
  'late',
  'leave',
] as const

export type SeriesKey = (typeof SERIES_KEYS)[number]

/** Tinted icon badge — matches dashboard StatCard. */
export function seriesToneClass(tone: SeriesKey): string {
  return `bg-[var(--chart-${tone})]/12 text-[var(--chart-${tone})]`
}

/** Soft banner gradient for module headers. */
export function seriesBannerGradient(tone: SeriesKey): string {
  return `linear-gradient(105deg, color-mix(in srgb, var(--chart-${tone}) 14%, var(--surface)) 0%, var(--surface) 55%, color-mix(in srgb, var(--product-500) 8%, var(--surface)) 100%)`
}

export const REPORT_TONE: Record<string, SeriesKey> = {
  collection: 'fees',
  attendance: 'attendance',
  academic: 'students',
  enrolment: 'students',
  admissions: 'admissions',
  staff: 'staff',
}
