/**
 * Number formatting for the ROI calculator.
 *
 * Indian digit grouping throughout — a school owner reads ₹1,25,000, and a
 * figure grouped as ₹125,000 quietly signals that the tool was not built for
 * them. Kept apart from the app's `formatMoney`, which works in minor units;
 * everything here is in whole rupees because that is how the inputs arrive.
 */

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const NUM = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
const NUM1 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 })

/** Guards the formatters against NaN and Infinity reaching the screen. */
function finite(value: number): number {
  return Number.isFinite(value) ? value : 0
}

export function formatInr(value: number): string {
  return INR.format(Math.round(finite(value)))
}

/**
 * Compact rupees for a headline card: ₹1.2L, ₹3.4Cr.
 *
 * Lakh and crore rather than K and M, for the same reason as the grouping.
 */
export function formatInrCompact(value: number): string {
  const n = Math.round(finite(value))
  const abs = Math.abs(n)
  if (abs >= 10_000_000) return `₹${NUM1.format(n / 10_000_000)}Cr`
  if (abs >= 100_000) return `₹${NUM1.format(n / 100_000)}L`
  return INR.format(n)
}

export function formatNumber(value: number): string {
  return NUM.format(finite(value))
}

export function formatHours(value: number): string {
  return `${NUM1.format(finite(value))} hrs`
}

export function formatPercent(value: number | null, digits = 0): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return `${value.toFixed(digits)}%`
}

/** Rounding helpers, so display precision is decided once. */
export const round0 = (n: number) => Math.round(finite(n))
export const round1 = (n: number) => Math.round(finite(n) * 10) / 10
export const round2 = (n: number) => Math.round(finite(n) * 100) / 100
