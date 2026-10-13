const IST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' })

/** Today's calendar date for the school (India), as YYYY-MM-DD. */
export function schoolToday(now: Date = new Date()): string {
  return IST.format(now)
}

function shift(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** April-to-March financial year containing `iso`. */
export function financialYearRange(iso: string): { from: string; to: string } {
  const year = Number(iso.slice(0, 4))
  const month = Number(iso.slice(5, 7))
  const start = month >= 4 ? year : year - 1
  return { from: `${start}-04-01`, to: `${start + 1}-03-31` }
}

export const PERIOD_PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'Last 7 days' },
  { key: 'month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'fy', label: 'This financial year' },
] as const

export type PeriodPreset = (typeof PERIOD_PRESETS)[number]['key']

export function presetRange(preset: string, now: Date = new Date()): { from: string; to: string } | null {
  const today = schoolToday(now)
  switch (preset) {
    case 'today':
      return { from: today, to: today }
    case 'yesterday': {
      const y = shift(today, -1)
      return { from: y, to: y }
    }
    case 'week':
      return { from: shift(today, -6), to: today }
    case 'month':
      return { from: `${today.slice(0, 7)}-01`, to: today }
    case 'last_month': {
      const firstThis = `${today.slice(0, 7)}-01`
      const lastPrev = shift(firstThis, -1)
      return { from: `${lastPrev.slice(0, 7)}-01`, to: lastPrev }
    }
    case 'fy':
      return { from: financialYearRange(today).from, to: today }
    default:
      return null
  }
}
