/**
 * Money in the books is whole paise in a Postgres INTEGER column, matching the
 * existing ledger (`JournalLine.debitMinor` and friends). Integers are exact,
 * so nothing here ever goes through a binary fraction.
 */

/** Largest value a Postgres INTEGER column holds: ₹2,14,74,836.47 in paise. */
export const MAX_MINOR = 2_147_483_647

export function isValidMinor(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_MINOR
}

const AMOUNT = /^(\d{1,9})(?:\.(\d{1,2}))?$/

/**
 * Parses a rupee amount typed by a person ("1,250.5", "₹ 99") into paise using
 * string arithmetic only. Returns null for anything that is not a plain
 * non-negative amount with at most two decimals or that would overflow.
 */
export function parseMoneyToMinor(input: string | number): number | null {
  const text = typeof input === 'number'
    ? (Number.isFinite(input) ? String(input) : '')
    : input.replace(/[₹,\s]/g, '').replace(/^Rs\.?/i, '')
  const match = AMOUNT.exec(text)
  if (!match) return null
  const rupees = Number(match[1])
  const paise = Number((match[2] ?? '').padEnd(2, '0'))
  const minor = rupees * 100 + paise
  return minor <= MAX_MINOR ? minor : null
}

/** "123456" paise -> "1234.56"; the reverse of parseMoneyToMinor. */
export function minorToDecimalString(minor: number): string {
  const sign = minor < 0 ? '-' : ''
  const abs = Math.abs(minor)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}
