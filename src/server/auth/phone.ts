import { env } from '@/lib/env'

/**
 * Phone numbers as typed versus as stored.
 *
 * School records hold E.164 (`+919842115933`) because that is what every
 * messaging provider wants. Parents type ten digits, or add spaces, or write
 * `0` in front, or paste `+91-98421 15933`. The lookup has to reconcile the
 * two, and getting this wrong looks to the user like "my number isn't
 * registered" when in fact it is.
 */

/** Digits only, `+` preserved if leading. */
function clean(raw: string): string {
  const trimmed = raw.trim()
  const digits = trimmed.replace(/[^\d]/g, '')
  return trimmed.startsWith('+') ? `+${digits}` : digits
}

/**
 * Normalises typed input to E.164, or null when it cannot be a phone number.
 *
 * Deliberately conservative: it applies the default country code only to a
 * bare national number, and never rewrites something that already carries a
 * country code. Guessing wrongly would silently look up a different person.
 */
export function normalizePhone(raw: string, countryCode = env().DEFAULT_COUNTRY_CODE): string | null {
  if (!raw) return null
  const value = clean(raw)
  const cc = clean(countryCode)
  const ccDigits = cc.replace('+', '')

  // Already international.
  if (value.startsWith('+')) {
    const digits = value.slice(1)
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null
  }

  // Written with the country code but no plus (919842115933).
  if (ccDigits && value.startsWith(ccDigits) && value.length > ccDigits.length + 6) {
    return `+${value}`
  }

  // A national number, possibly with a trunk zero (09842115933).
  const national = value.replace(/^0+/, '')
  if (national.length < 6 || national.length > 12) return null

  return `+${ccDigits}${national}`
}

/**
 * `+91 ····· 5933` — enough for someone to recognise their own number and not
 * enough to be worth harvesting. Only ever shown for a number the caller has
 * just typed, never for one read back out of the database.
 */
export function maskPhone(e164: string): string {
  const digits = e164.replace(/[^\d]/g, '')
  if (digits.length < 4) return '·····'
  const last = digits.slice(-4)
  const cc = e164.startsWith('+') ? `+${digits.slice(0, digits.length - 10 > 0 ? digits.length - 10 : 2)} ` : ''
  return `${cc}····· ${last}`
}
