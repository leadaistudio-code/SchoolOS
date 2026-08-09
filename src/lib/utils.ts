import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Money is stored in minor units everywhere; format only at the edges. */
export function formatMoney(
  minor: number,
  currency = 'INR',
  locale = 'en-IN',
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(minor / 100)
}

export function formatNumber(value: number, locale = 'en-IN'): string {
  return new Intl.NumberFormat(locale).format(value)
}

export function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
}

export function fullName(p: { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName}`.trim()
}

/**
 * Derives a readable-contrast text colour for an arbitrary brand colour, so
 * white-labelled buttons stay legible whatever a school picks.
 */
export function contrastOn(hex: string): string {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return '#ffffff'
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.62 ? '#0b0f17' : '#ffffff'
}

/** Lighten/darken a hex colour by mixing toward white or black. */
export function shade(hex: string, amount: number): string {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return hex
  const target = amount < 0 ? 0 : 255
  const p = Math.abs(amount)
  const mix = (c: number) => Math.round(c + (target - c) * p)
  const r = mix(parseInt(clean.slice(0, 2), 16))
  const g = mix(parseInt(clean.slice(2, 4), 16))
  const b = mix(parseInt(clean.slice(4, 6), 16))
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}
