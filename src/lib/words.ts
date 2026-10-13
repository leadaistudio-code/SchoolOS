/**
 * Numbers and dates spelled out, as certificates (TC, admission forms) print
 * them beside the figures. Title case, Indian grouping.
 */

const ONES = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
  'Eighteen', 'Nineteen',
]
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

const ORDINAL_ONES = [
  '', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth',
  'Tenth', 'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth', 'Sixteenth',
  'Seventeenth', 'Eighteenth', 'Nineteenth',
]
const ORDINAL_TENS = ['', '', 'Twentieth', 'Thirtieth']

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function under100(n: number): string {
  if (n < 20) return ONES[n]!
  const t = Math.floor(n / 10)
  const o = n % 10
  return o ? `${TENS[t]} ${ONES[o]}` : TENS[t]!
}

function under1000(n: number): string {
  if (n < 100) return under100(n)
  const h = Math.floor(n / 100)
  const rest = n % 100
  return rest ? `${ONES[h]} Hundred ${under100(rest)}` : `${ONES[h]} Hundred`
}

/** 1234567 -> "Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven". */
export function numberToWords(value: number): string {
  let n = Math.floor(Math.abs(value))
  if (n === 0) return 'Zero'
  const parts: string[] = []
  const crore = Math.floor(n / 10_000_000)
  n %= 10_000_000
  const lakh = Math.floor(n / 100_000)
  n %= 100_000
  const thousand = Math.floor(n / 1000)
  n %= 1000
  if (crore) parts.push(`${numberToWords(crore)} Crore`)
  if (lakh) parts.push(`${under100(lakh)} Lakh`)
  if (thousand) parts.push(`${under100(thousand)} Thousand`)
  if (n) parts.push(under1000(n))
  return parts.join(' ')
}

/** 1..31 -> "First".."Thirty First". */
export function ordinalWords(n: number): string {
  if (n < 20) return ORDINAL_ONES[n] ?? String(n)
  const t = Math.floor(n / 10)
  const o = n % 10
  if (!o) return ORDINAL_TENS[t] ?? `${TENS[t]}th`
  return `${TENS[t]} ${ORDINAL_ONES[o]}`
}

/** 2012-03-15 -> "Fifteenth March Two Thousand Twelve". */
export function dateToWords(date: Date | null | undefined): string {
  if (!date) return ''
  const d = date.getUTCDate()
  const m = date.getUTCMonth()
  const y = date.getUTCFullYear()
  return `${ordinalWords(d)} ${MONTHS[m]} ${numberToWords(y)}`
}

/**
 * Class names as words for the TC: "Class 5" / "V" / "5" -> "Fifth".
 * Pre-primary names (Nursery, LKG, UKG) pass through unchanged.
 */
export function classInWords(name: string | null | undefined, numeric?: number | null): string {
  if (!name && numeric == null) return ''
  const roman: Record<string, number> = {
    I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12,
  }
  const raw = (name ?? '').replace(/^(class|grade|std\.?|standard)\s*/i, '').trim()
  const digit = /^(\d{1,2})\b/.exec(raw)?.[1]
  const fromRoman = roman[raw.split(/[\s-]/)[0]?.toUpperCase() ?? '']
  const n = digit ? Number(digit) : fromRoman ?? (numeric && numeric > 0 && numeric <= 12 && !raw ? numeric : null)
  if (n && n >= 1 && n <= 12) {
    const suffix = raw.replace(/^(\d{1,2}|[IVX]+)\b/i, '').trim()
    return suffix ? `${ordinalWords(n)} ${suffix}` : ordinalWords(n)
  }
  return name ?? ''
}

/** Whole years, months and days between two dates (age on a given day). */
export function ageOn(dob: Date | null | undefined, on: Date = new Date()): { years: number; months: number; days: number } | null {
  if (!dob) return null
  let years = on.getUTCFullYear() - dob.getUTCFullYear()
  let months = on.getUTCMonth() - dob.getUTCMonth()
  let days = on.getUTCDate() - dob.getUTCDate()
  if (days < 0) {
    months -= 1
    days += new Date(Date.UTC(on.getUTCFullYear(), on.getUTCMonth(), 0)).getUTCDate()
  }
  if (months < 0) {
    years -= 1
    months += 12
  }
  if (years < 0) return null
  return { years, months, days }
}

export function formatAge(dob: Date | null | undefined, on?: Date): string {
  const a = ageOn(dob, on)
  if (!a) return ''
  return `${a.years} yrs ${a.months} mths ${a.days} days`
}
