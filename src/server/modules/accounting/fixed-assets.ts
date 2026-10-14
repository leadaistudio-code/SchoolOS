/**
 * Fixed assets: written-down-value (reducing balance) depreciation. Pure.
 *
 * Rules (agreed):
 * - Rates are ANNUAL, stored in basis points of a percent (18.10% = 1810).
 * - Each financial year is charged on that year's OPENING written-down value:
 *     year charge = opening WDV x annual rate x chargeable days / days in year
 *   Days count from the depreciation start date (first year) and up to the
 *   disposal date or end of useful life (last year), both inclusive. A year has
 *   365 or 366 days, so a full year is exactly opening WDV x rate.
 * - Monthly runs never apply the annual rate monthly: they post the part of the
 *   year charge earned so far. Within a year the CUMULATIVE charge to a date is
 *   rounded once (half up, to the paisa) and each run posts cumulative minus what
 *   is already posted that year. Rounding therefore never accumulates and twelve
 *   monthly runs add up to exactly the one yearly figure.
 * - Book value is cost - depreciation brought forward - posted schedule lines;
 *   it is never re-derived by applying the rate to an already rounded balance.
 * - WDV never goes below the residual value. When a useful life is set, the run
 *   covering its last day writes the asset down exactly to residual.
 * - A rate change applies from the day after the last posted line; posted lines
 *   are never recalculated.
 * - Schedule lines never cross a financial year boundary. A run that catches up
 *   missed periods produces one line per financial year.
 */
import { fiscalYearOf } from './fiscal-year'

export const DEFAULT_RESIDUAL_PERCENT = 5
export const MAX_RATE_BP = 10_000

export type DepreciationFrequency = 'MONTHLY' | 'YEARLY'

export type RateSegment = { from: string; rateBp: number }

export type AssetTerms = {
  costMinor: number
  /** Depreciation already charged before `depreciationStartOn` (assets brought in mid-life). */
  openingAccumulatedMinor: number
  depreciationStartOn: string
  residualMinor: number
  usefulLifeMonths: number | null
  /** Sorted by `from`; the first applies from the depreciation start date. */
  rates: RateSegment[]
  disposedOn?: string | null
}

export type ScheduleLine = { fromDate: string; toDate: string; amountMinor: number }

export type ComputedLine = ScheduleLine & {
  fiscalYearLabel: string
  fyOpeningWdvMinor: number
  chargeableDays: number
  rateBp: number
  openingWdvMinor: number
  closingWdvMinor: number
  /** The line that brings the asset to residual at the end of its useful life. */
  lifeEnd: boolean
}

// ------------------------------------------------------------------ dates

const DAY_MS = 86_400_000

function toUtc(iso: string) {
  return Date.parse(`${iso}T00:00:00.000Z`)
}

export function addDays(iso: string, days: number): string {
  return new Date(toUtc(iso) + days * DAY_MS).toISOString().slice(0, 10)
}

/** Inclusive count of days from `from` to `to`; 0 when `to` is before `from`. */
export function daysInclusive(from: string, to: string): number {
  if (to < from) return 0
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS) + 1
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

/** `iso` plus whole months, clamped to the month's last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(iso: string, months: number): string {
  const y = Number(iso.slice(0, 4))
  const m = Number(iso.slice(5, 7)) - 1 + months
  const d = Number(iso.slice(8, 10))
  const year = y + Math.floor(m / 12)
  const month = ((m % 12) + 12) % 12
  return new Date(Date.UTC(year, month, Math.min(d, daysInMonth(year, month)))).toISOString().slice(0, 10)
}

/** Last day of the useful life, inclusive. */
export function lifeEndDate(startOn: string, usefulLifeMonths: number | null): string | null {
  if (!usefulLifeMonths) return null
  return addDays(addMonths(startOn, usefulLifeMonths), -1)
}

export function periodContaining(iso: string, frequency: DepreciationFrequency, startMonth: number) {
  if (frequency === 'YEARLY') {
    const fy = fiscalYearOf(iso, startMonth)
    return { start: fy.startsOn, end: fy.endsOn, label: `FY ${fy.label}` }
  }
  const start = `${iso.slice(0, 8)}01`
  const end = addDays(addMonths(start, 1), -1)
  const label = new Date(`${start}T00:00:00Z`).toLocaleString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' })
  return { start, end, label }
}

export function isPeriodEnd(iso: string, frequency: DepreciationFrequency, startMonth: number) {
  return periodContaining(iso, frequency, startMonth).end === iso
}

// ------------------------------------------------------------------ maths

function roundHalfUp(numerator: bigint, denominator: bigint): number {
  if (numerator <= 0n) return 0
  return Number((numerator * 2n + denominator) / (denominator * 2n))
}

export function rateAt(rates: RateSegment[], iso: string): number {
  let rate = rates[0]?.rateBp ?? 0
  for (const r of rates) if (r.from <= iso) rate = r.rateBp
  return rate
}

/**
 * Cumulative charge for a financial year from `chargeFrom` to `to`, rounded
 * once. Rate changes inside the year weight the days at each rate.
 */
export function cumulativeYearCharge(
  fyOpeningWdvMinor: number,
  rates: RateSegment[],
  chargeFrom: string,
  to: string,
  daysInYear: number,
): number {
  if (fyOpeningWdvMinor <= 0 || to < chargeFrom) return 0
  let rateDays = 0n
  rates.forEach((segment, i) => {
    const next = rates[i + 1]
    const segFrom = segment.from > chargeFrom ? segment.from : chargeFrom
    const segTo = next ? (addDays(next.from, -1) < to ? addDays(next.from, -1) : to) : to
    const days = daysInclusive(segFrom, segTo)
    if (days > 0) rateDays += BigInt(segment.rateBp) * BigInt(days)
  })
  return roundHalfUp(BigInt(fyOpeningWdvMinor) * rateDays, 10_000n * BigInt(daysInYear))
}

export function writtenDownValue(terms: Pick<AssetTerms, 'costMinor' | 'openingAccumulatedMinor'>, lines: ScheduleLine[]) {
  return terms.costMinor - terms.openingAccumulatedMinor - lines.reduce((s, l) => s + l.amountMinor, 0)
}

/** The last day already depreciated, or the day before depreciation starts. */
export function depreciatedThrough(terms: Pick<AssetTerms, 'depreciationStartOn'>, posted: ScheduleLine[]) {
  return posted.reduce((last, l) => (l.toDate > last ? l.toDate : last), addDays(terms.depreciationStartOn, -1))
}

/**
 * Depreciation due from the day after the last posted line up to `through`
 * (stopping at disposal or end of life). Returns one line per financial year
 * with a non-zero charge; an empty list means nothing is due.
 */
export function computeDepreciation(terms: AssetTerms, posted: ScheduleLine[], through: string, startMonth: number): ComputedLine[] {
  const lifeEnd = lifeEndDate(terms.depreciationStartOn, terms.usefulLifeMonths)
  let end = through
  if (lifeEnd && lifeEnd < end) end = lifeEnd
  if (terms.disposedOn && terms.disposedOn < end) end = terms.disposedOn

  let cursor = addDays(depreciatedThrough(terms, posted), 1)
  if (cursor < terms.depreciationStartOn) cursor = terms.depreciationStartOn
  if (cursor > end) return []

  const lines: ComputedLine[] = []
  let wdv = writtenDownValue(terms, posted)
  while (cursor <= end) {
    const fy = fiscalYearOf(cursor, startMonth)
    const segmentEnd = fy.endsOn < end ? fy.endsOn : end
    const chargeFrom = fy.startsOn > terms.depreciationStartOn ? fy.startsOn : terms.depreciationStartOn
    const all = [...posted, ...lines]
    const fyOpeningWdv = terms.costMinor - terms.openingAccumulatedMinor
      - all.filter((l) => l.toDate < fy.startsOn).reduce((s, l) => s + l.amountMinor, 0)
    const postedInYear = all.filter((l) => l.fromDate >= fy.startsOn && l.toDate <= fy.endsOn).reduce((s, l) => s + l.amountMinor, 0)
    const daysInYear = daysInclusive(fy.startsOn, fy.endsOn)

    const remaining = Math.max(0, wdv - terms.residualMinor)
    const isLifeEnd = !!lifeEnd && segmentEnd === lifeEnd
    let amount = isLifeEnd
      ? remaining
      : cumulativeYearCharge(fyOpeningWdv, terms.rates, chargeFrom, segmentEnd, daysInYear) - postedInYear
    amount = Math.min(Math.max(0, amount), remaining)

    if (amount > 0) {
      lines.push({
        fromDate: cursor,
        toDate: segmentEnd,
        amountMinor: amount,
        fiscalYearLabel: fy.label,
        fyOpeningWdvMinor: fyOpeningWdv,
        chargeableDays: daysInclusive(cursor, segmentEnd),
        rateBp: rateAt(terms.rates, segmentEnd),
        openingWdvMinor: wdv,
        closingWdvMinor: wdv - amount,
        lifeEnd: isLifeEnd,
      })
      wdv -= amount
    }
    cursor = addDays(segmentEnd, 1)
  }
  return lines
}

/** True once nothing more can ever be charged (at residual, or life over). */
export function isFullyDepreciated(terms: AssetTerms, posted: ScheduleLine[]) {
  if (writtenDownValue(terms, posted) <= terms.residualMinor) return true
  const lifeEnd = lifeEndDate(terms.depreciationStartOn, terms.usefulLifeMonths)
  return !!lifeEnd && depreciatedThrough(terms, posted) >= lifeEnd
}

/** Forward schedule: what the next `periods` runs would post if nothing changes. */
export function projectSchedule(
  terms: AssetTerms,
  posted: ScheduleLine[],
  options: { frequency: DepreciationFrequency; startMonth: number; periods: number },
): (ComputedLine & { periodEnd: string })[] {
  const out: (ComputedLine & { periodEnd: string })[] = []
  const simulated = [...posted]
  let after = depreciatedThrough(terms, posted)
  for (let i = 0; i < options.periods && !isFullyDepreciated(terms, simulated); i++) {
    const periodEnd = periodContaining(addDays(after, 1), options.frequency, options.startMonth).end
    for (const line of computeDepreciation(terms, simulated, periodEnd, options.startMonth)) {
      out.push({ ...line, periodEnd })
      simulated.push(line)
    }
    after = periodEnd
    if (terms.disposedOn && after >= terms.disposedOn) break
  }
  return out
}

/**
 * The annual WDV rate that takes `cost` to `residual` over the useful life:
 * r = 1 - (residual / cost) ^ (1 / years). Needs 0 < residual < cost.
 */
export function suggestWdvRateBp(costMinor: number, residualMinor: number, usefulLifeMonths: number): number | null {
  if (!(costMinor > 0) || !(residualMinor > 0) || residualMinor >= costMinor || !(usefulLifeMonths > 0)) return null
  const rate = 1 - Math.pow(residualMinor / costMinor, 12 / usefulLifeMonths)
  return Math.min(MAX_RATE_BP, Math.max(1, Math.round(rate * MAX_RATE_BP)))
}

export function defaultResidualMinor(costMinor: number) {
  return Math.floor((costMinor * DEFAULT_RESIDUAL_PERCENT + 50) / 100)
}

/** "18.1" or "18.10" -> 1810. Null unless 0 < rate <= 100 with at most two decimals. */
export function parseRateToBp(input: string | number): number | null {
  const text = String(input).trim()
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) return null
  const [whole, frac = ''] = text.split('.')
  const bp = Number(whole) * 100 + Number(frac.padEnd(2, '0'))
  return bp > 0 && bp <= MAX_RATE_BP ? bp : null
}

export function formatRate(bp: number) {
  return `${(bp / 100).toFixed(2)}%`
}

// ------------------------------------------------------------------ postings

export type PostingLine = { accountId: string; debitMinor: number; creditMinor: number; memo?: string }

/** Depreciation run: Dr depreciation expense, Cr accumulated depreciation. */
export function depreciationJournalLines(totalMinor: number, accounts: { expense: string; accumulated: string }): PostingLine[] {
  if (totalMinor <= 0) return []
  return [
    { accountId: accounts.expense, debitMinor: totalMinor, creditMinor: 0, memo: 'Depreciation for the period' },
    { accountId: accounts.accumulated, debitMinor: 0, creditMinor: totalMinor, memo: 'Depreciation for the period' },
  ]
}

/**
 * Disposal in one balanced entry: the final depreciation to the disposal date,
 * then the asset leaves the books at cost with its accumulated depreciation,
 * the proceeds come in and the difference is a gain or loss.
 *   gain (loss) = proceeds - (cost - accumulated after final depreciation)
 */
export function disposalJournalLines(input: {
  costMinor: number
  accumulatedBeforeMinor: number
  finalDepreciationMinor: number
  proceedsMinor: number
  accounts: { asset: string; accumulated: string; expense: string; proceeds: string | null; gain: string; loss: string }
}): { lines: PostingLine[]; gainLossMinor: number; bookValueMinor: number } {
  const { costMinor, accumulatedBeforeMinor, finalDepreciationMinor, proceedsMinor, accounts } = input
  const accumulated = accumulatedBeforeMinor + finalDepreciationMinor
  const bookValueMinor = costMinor - accumulated
  const gainLossMinor = proceedsMinor - bookValueMinor
  const lines: PostingLine[] = []
  if (finalDepreciationMinor > 0) {
    lines.push({ accountId: accounts.expense, debitMinor: finalDepreciationMinor, creditMinor: 0, memo: 'Depreciation to disposal date' })
  }
  if (accumulatedBeforeMinor > 0) {
    lines.push({ accountId: accounts.accumulated, debitMinor: accumulatedBeforeMinor, creditMinor: 0, memo: 'Accumulated depreciation removed' })
  }
  if (proceedsMinor > 0) {
    if (!accounts.proceeds) throw new Error('A proceeds account is needed when the asset is sold')
    lines.push({ accountId: accounts.proceeds, debitMinor: proceedsMinor, creditMinor: 0, memo: 'Sale proceeds' })
  }
  if (gainLossMinor < 0) lines.push({ accountId: accounts.loss, debitMinor: -gainLossMinor, creditMinor: 0, memo: 'Loss on disposal' })
  lines.push({ accountId: accounts.asset, debitMinor: 0, creditMinor: costMinor, memo: 'Asset removed at cost' })
  if (gainLossMinor > 0) lines.push({ accountId: accounts.gain, debitMinor: 0, creditMinor: gainLossMinor, memo: 'Gain on disposal' })
  return { lines, gainLossMinor, bookValueMinor }
}

export function isBalanced(lines: PostingLine[]) {
  const debit = lines.reduce((s, l) => s + l.debitMinor, 0)
  const credit = lines.reduce((s, l) => s + l.creditMinor, 0)
  return debit === credit && debit > 0
}

// ------------------------------------------------------------ reconciliation

export type RegisterAsset = { assetAccountId: string; costMinor: number; accumulatedMinor: number }

/**
 * Register vs ledger as at a date. Cost per fixed-asset ledger must equal that
 * ledger's debit balance; total accumulated depreciation must equal the credit
 * balance of the accumulated depreciation ledger.
 */
export function reconcileAssetRegister(input: {
  assets: RegisterAsset[]
  ledgerBalances: Map<string, number>
  accumulatedAccountId: string | null
}) {
  const costByAccount = new Map<string, number>()
  for (const a of input.assets) costByAccount.set(a.assetAccountId, (costByAccount.get(a.assetAccountId) ?? 0) + a.costMinor)
  const cost = [...costByAccount.entries()].map(([accountId, registerMinor]) => {
    const ledgerMinor = input.ledgerBalances.get(accountId) ?? 0
    return { accountId, registerMinor, ledgerMinor, differenceMinor: ledgerMinor - registerMinor }
  })
  const registerAccumulated = input.assets.reduce((s, a) => s + a.accumulatedMinor, 0)
  const ledgerAccumulated = input.accumulatedAccountId ? -(input.ledgerBalances.get(input.accumulatedAccountId) ?? 0) : 0
  const accumulated = {
    accountId: input.accumulatedAccountId,
    registerMinor: registerAccumulated,
    ledgerMinor: ledgerAccumulated,
    differenceMinor: ledgerAccumulated - registerAccumulated,
  }
  return {
    cost,
    accumulated,
    matches: cost.every((c) => c.differenceMinor === 0) && accumulated.differenceMinor === 0,
  }
}