/**
 * Formatting shared by every screen.
 *
 * Money is the one that matters: the API speaks minor units (paise), and a
 * screen that forgets to divide reports a ₹5,000 fee as ₹500,000. Doing the
 * conversion in exactly one place is the only reliable defence.
 */

/** Paise to rupees, grouped the Indian way — ₹86,49,000 not ₹8,649,000. */
export function money(minor: number | null | undefined, currency = 'INR'): string {
  const major = (minor ?? 0) / 100
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: major % 1 === 0 ? 0 : 2,
    }).format(major)
  } catch {
    return `₹${Math.round(major).toLocaleString('en-IN')}`
  }
}

/**
 * Money for a stat card, where the column is narrow and the exact rupee is not
 * the point. ₹86.5L reads at a glance; ₹86,49,000 wraps and is scanned slowly.
 */
export function moneyShort(minor: number | null | undefined): string {
  const major = Math.abs((minor ?? 0) / 100)
  const sign = (minor ?? 0) < 0 ? '-' : ''
  if (major >= 10_000_000) return `${sign}₹${trim(major / 10_000_000)}Cr`
  if (major >= 100_000) return `${sign}₹${trim(major / 100_000)}L`
  if (major >= 1_000) return `${sign}₹${trim(major / 1_000)}K`
  return `${sign}₹${Math.round(major)}`
}

function trim(n: number): string {
  return n >= 100 ? String(Math.round(n)) : n.toFixed(1).replace(/\.0$/, '')
}

export function count(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString('en-IN')
}

/** `2026-08-19`, the shape the attendance API expects. */
export function apiDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function longDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** "Today", "Yesterday", then the date. Relative beyond that reads as vague. */
export function friendlyDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return ''

  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOf(new Date()) - startOf(date)) / 86_400_000)

  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days > 1 && days < 7) return `${days} days ago`
  return longDate(date)
}

export function fullName(first: string, last: string): string {
  return `${first} ${last}`.trim()
}
