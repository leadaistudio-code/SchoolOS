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

/** Sidebar / module icon colour by route — mirrors Settings hub tiles. */
export function navIconTone(href: string): SeriesKey {
  const path = href === '/' ? '/' : href.replace(/\/$/, '')

  if (path === '/') return 'admissions'
  if (path.startsWith('/students') || path.startsWith('/my/')) return 'students'
  if (path.startsWith('/parents') || path.startsWith('/feedback')) return 'parents'
  if (path.startsWith('/staff')) return 'staff'
  if (path.startsWith('/attendance') || path.startsWith('/leave')) return 'attendance'
  if (path.startsWith('/academics') || path.startsWith('/assessments') || path.startsWith('/teacher')) {
    return 'admissions'
  }
  if (path.startsWith('/exams') || path.startsWith('/score')) return 'late'
  if (path.startsWith('/finance') || path.startsWith('/reports')) return 'fees'
  if (path.startsWith('/admissions') || path.startsWith('/front-office') || path.startsWith('/website')) {
    return 'admissions'
  }
  if (path.startsWith('/transport') || path.startsWith('/library') || path.startsWith('/inventory')) {
    return 'transport'
  }
  if (path.startsWith('/sports') || path.startsWith('/events')) return 'parents'
  if (path.startsWith('/communication')) return 'overdue'
  if (path.startsWith('/settings') || path.startsWith('/account') || path.startsWith('/admin')) {
    return 'staff'
  }
  return 'pending'
}

