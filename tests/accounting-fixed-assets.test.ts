import { describe, expect, it } from 'vitest'
import {
  addMonths,
  computeDepreciation,
  cumulativeYearCharge,
  daysInclusive,
  defaultResidualMinor,
  depreciationJournalLines,
  disposalJournalLines,
  isBalanced,
  isFullyDepreciated,
  isPeriodEnd,
  lifeEndDate,
  parseRateToBp,
  periodContaining,
  projectSchedule,
  reconcileAssetRegister,
  suggestWdvRateBp,
  writtenDownValue,
  type AssetTerms,
  type ScheduleLine,
} from '@/server/modules/accounting/fixed-assets'

const APRIL = 4
const LAKH = 1_00_000_00 // ₹1,00,000.00 in paise

function terms(extra: Partial<AssetTerms> = {}): AssetTerms {
  return {
    costMinor: LAKH,
    openingAccumulatedMinor: 0,
    depreciationStartOn: '2026-04-01',
    residualMinor: defaultResidualMinor(LAKH),
    usefulLifeMonths: null,
    rates: [{ from: '2026-04-01', rateBp: 1810 }],
    ...extra,
  }
}

/** Posts every period end in turn, as a school would, and returns the posted lines. */
function runPeriods(t: AssetTerms, periodEnds: string[], posted: ScheduleLine[] = []) {
  const lines = [...posted]
  for (const end of periodEnds) lines.push(...computeDepreciation(t, lines, end, APRIL))
  return lines
}

function monthEnds(fromMonthStart: string, count: number) {
  return Array.from({ length: count }, (_, i) => addMonths(addMonths(fromMonthStart, i + 1), 0)).map((m) => {
    const d = new Date(`${m}T00:00:00Z`)
    d.setUTCDate(0)
    return d.toISOString().slice(0, 10)
  })
}

describe('dates and periods', () => {
  it('month arithmetic clamps to month end and life ends the day before', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2027-01-31', 13)).toBe('2028-02-29')
    expect(lifeEndDate('2026-04-01', 36)).toBe('2029-03-31')
    expect(lifeEndDate('2026-04-01', null)).toBeNull()
    expect(daysInclusive('2026-04-01', '2027-03-31')).toBe(365)
    expect(daysInclusive('2027-04-01', '2028-03-31')).toBe(366)
  })

  it('monthly and yearly periods follow the financial year', () => {
    expect(periodContaining('2026-10-14', 'MONTHLY', APRIL)).toMatchObject({ start: '2026-10-01', end: '2026-10-31' })
    expect(periodContaining('2026-10-14', 'YEARLY', APRIL)).toMatchObject({ start: '2026-04-01', end: '2027-03-31' })
    expect(isPeriodEnd('2027-02-28', 'MONTHLY', APRIL)).toBe(true)
    expect(isPeriodEnd('2027-02-27', 'MONTHLY', APRIL)).toBe(false)
    expect(isPeriodEnd('2026-12-31', 'YEARLY', APRIL)).toBe(false)
    expect(monthEnds('2026-04-01', 3)).toEqual(['2026-04-30', '2026-05-31', '2026-06-30'])
  })
})

describe('WDV, annual periods', () => {
  it('a full year is exactly opening WDV x annual rate, and the next year runs on the reduced value', () => {
    const lines = runPeriods(terms(), ['2027-03-31', '2028-03-31'])
    expect(lines.map((l) => l.amountMinor)).toEqual([18_100_00, 14_823_90])
    expect(lines[1]).toMatchObject({ fyOpeningWdvMinor: 81_900_00, chargeableDays: 366 })
    expect(writtenDownValue(terms(), lines)).toBe(LAKH - 18_100_00 - 14_823_90)
  })

  it('a part first year is pro-rata by days from the depreciation start date', () => {
    const [line] = computeDepreciation(terms({ depreciationStartOn: '2026-10-01' }), [], '2027-03-31', APRIL)
    // 1,00,000 x 18.10% x 182 / 365 = 9,025.205... -> ₹9,025.21
    expect(line).toMatchObject({ fromDate: '2026-10-01', toDate: '2027-03-31', chargeableDays: 182, amountMinor: 9_025_21 })
  })

  it('a missed year is caught up as one line per financial year, never across years', () => {
    const lines = computeDepreciation(terms(), [], '2028-03-31', APRIL)
    expect(lines.map((l) => [l.fromDate, l.toDate, l.amountMinor])).toEqual([
      ['2026-04-01', '2027-03-31', 18_100_00],
      ['2027-04-01', '2028-03-31', 14_823_90],
    ])
  })
})

describe('WDV, monthly periods', () => {
  const months = monthEnds('2026-04-01', 12)

  it('never applies the annual rate monthly: April is 30/365 of the year charge', () => {
    const [april] = computeDepreciation(terms(), [], '2026-04-30', APRIL)
    // 1,00,000 x 18.10% x 30 / 365 = 1,487.67
    expect(april?.amountMinor).toBe(1_487_67)
  })

  it('twelve monthly runs add up to exactly the yearly figure', () => {
    const monthly = runPeriods(terms(), months)
    expect(monthly).toHaveLength(12)
    expect(monthly.reduce((s, l) => s + l.amountMinor, 0)).toBe(18_100_00)
  })

  it('monthly in a leap year still totals opening WDV x rate', () => {
    const afterYearOne = runPeriods(terms(), ['2027-03-31'])
    const leap = runPeriods(terms(), monthEnds('2027-04-01', 12), afterYearOne).slice(1)
    expect(leap.reduce((s, l) => s + l.amountMinor, 0)).toBe(14_823_90)
    const feb = leap.find((l) => l.toDate === '2028-02-29') as { chargeableDays: number } | undefined
    expect(feb?.chargeableDays).toBe(29)
  })

  it('each month posts cumulative minus posted, so rounding never drifts', () => {
    const monthly = runPeriods(terms(), months)
    let posted = 0
    for (const line of monthly) {
      posted += line.amountMinor
      const expected = cumulativeYearCharge(LAKH, [{ from: '2026-04-01', rateBp: 1810 }], '2026-04-01', line.toDate, 365)
      expect(posted).toBe(expected)
    }
  })

  it('running the same period twice charges nothing the second time', () => {
    const first = runPeriods(terms(), ['2026-04-30'])
    expect(computeDepreciation(terms(), first, '2026-04-30', APRIL)).toEqual([])
    expect(computeDepreciation(terms(), first, '2026-04-15', APRIL)).toEqual([])
  })
})

describe('residual value, useful life, rate changes, disposal', () => {
  it('never goes below residual value', () => {
    const t = terms({ rates: [{ from: '2026-04-01', rateBp: 9000 }] })
    const lines = runPeriods(t, ['2027-03-31', '2028-03-31', '2029-03-31', '2030-03-31'])
    expect(writtenDownValue(t, lines)).toBe(t.residualMinor)
    expect(isFullyDepreciated(t, lines)).toBe(true)
    expect(computeDepreciation(t, lines, '2031-03-31', APRIL)).toEqual([])
  })

  it('the last day of the useful life writes the asset down exactly to residual', () => {
    const t = terms({ usefulLifeMonths: 36, rates: [{ from: '2026-04-01', rateBp: 2589 }] })
    const lines = runPeriods(t, ['2027-03-31', '2028-03-31', '2029-03-31', '2030-03-31'])
    expect(lines).toHaveLength(3)
    expect(lines[2]).toMatchObject({ toDate: '2029-03-31', lifeEnd: true })
    expect(writtenDownValue(t, lines)).toBe(t.residualMinor)
  })

  it('a rate change applies from the next unposted day; posted months are not recalculated', () => {
    const before = terms()
    const firstHalf = runPeriods(before, monthEnds('2026-04-01', 6))
    const postedSoFar = firstHalf.reduce((s, l) => s + l.amountMinor, 0)
    const after = terms({ rates: [{ from: '2026-04-01', rateBp: 1810 }, { from: '2026-10-01', rateBp: 2500 }] })
    const rest = runPeriods(after, monthEnds('2026-10-01', 6), firstHalf).slice(6)
    // 1,00,000 x (18.10% x 183 + 25% x 182) / 365
    const year = cumulativeYearCharge(LAKH, after.rates, '2026-04-01', '2027-03-31', 365)
    expect(year).toBe(Math.floor((LAKH * (1810 * 183 + 2500 * 182) * 2 + 10_000 * 365) / (10_000 * 365 * 2)))
    expect(postedSoFar + rest.reduce((s, l) => s + l.amountMinor, 0)).toBe(year)
    expect(firstHalf.slice(0, 6).every((l, i) => l === firstHalf[i])).toBe(true)
  })

  it('stops at the disposal date', () => {
    const t = terms({ disposedOn: '2026-06-15' })
    const lines = computeDepreciation(t, [], '2027-03-31', APRIL)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ toDate: '2026-06-15', chargeableDays: 76 })
  })

  it('an asset brought in mid-life depreciates from its opening written-down value', () => {
    const t = terms({ openingAccumulatedMinor: 40_000_00, depreciationStartOn: '2026-04-01' })
    const [line] = computeDepreciation(t, [], '2027-03-31', APRIL)
    expect(line).toMatchObject({ fyOpeningWdvMinor: 60_000_00, amountMinor: 10_860_00 })
  })

  it('projects the forward schedule without touching posted lines', () => {
    const posted = runPeriods(terms(), ['2027-03-31'])
    const next = projectSchedule(terms(), posted, { frequency: 'YEARLY', startMonth: APRIL, periods: 2 })
    expect(next.map((l) => [l.periodEnd, l.amountMinor])).toEqual([
      ['2028-03-31', 14_823_90],
      ['2029-03-31', Math.round((LAKH - 18_100_00 - 14_823_90) * 0.181)],
    ])
    expect(posted).toHaveLength(1)
  })
})

describe('rates and residual helpers', () => {
  it('suggests the WDV rate from useful life (Companies Act: 10 years, 5% residual = 25.89%)', () => {
    expect(suggestWdvRateBp(LAKH, defaultResidualMinor(LAKH), 120)).toBe(2589)
    expect(suggestWdvRateBp(LAKH, 0, 120)).toBeNull()
  })

  it('parses rates as annual percentages with two decimals', () => {
    expect(parseRateToBp('18.1')).toBe(1810)
    expect(parseRateToBp('40')).toBe(4000)
    expect(parseRateToBp('100')).toBe(10_000)
    expect(parseRateToBp('0')).toBeNull()
    expect(parseRateToBp('100.01')).toBeNull()
    expect(parseRateToBp('1.234')).toBeNull()
  })
})

describe('journals balance', () => {
  const accounts = { asset: 'fa', accumulated: 'acc', expense: 'dep', proceeds: 'bank', gain: 'gain', loss: 'loss' }

  it('depreciation run: Dr depreciation, Cr accumulated depreciation', () => {
    const lines = depreciationJournalLines(18_100_00, { expense: 'dep', accumulated: 'acc' })
    expect(isBalanced(lines)).toBe(true)
    expect(depreciationJournalLines(0, { expense: 'dep', accumulated: 'acc' })).toEqual([])
  })

  it('disposal at a gain and at a loss', () => {
    const gain = disposalJournalLines({ costMinor: LAKH, accumulatedBeforeMinor: 18_100_00, finalDepreciationMinor: 3_000_00, proceedsMinor: 85_000_00, accounts })
    expect(gain).toMatchObject({ bookValueMinor: 78_900_00, gainLossMinor: 6_100_00 })
    expect(isBalanced(gain.lines)).toBe(true)

    const scrapped = disposalJournalLines({ costMinor: LAKH, accumulatedBeforeMinor: 18_100_00, finalDepreciationMinor: 0, proceedsMinor: 0, accounts: { ...accounts, proceeds: null } })
    expect(scrapped.gainLossMinor).toBe(-81_900_00)
    expect(isBalanced(scrapped.lines)).toBe(true)
  })
})

describe('register reconciliation', () => {
  it('matches cost per asset ledger and total accumulated depreciation', () => {
    const assets = [
      { assetAccountId: 'fa', costMinor: LAKH, accumulatedMinor: 18_100_00 },
      { assetAccountId: 'fa', costMinor: 50_000_00, accumulatedMinor: 0 },
      { assetAccountId: 'vehicles', costMinor: 8_00_000_00, accumulatedMinor: 1_20_000_00 },
    ]
    const ok = reconcileAssetRegister({
      assets,
      ledgerBalances: new Map([['fa', 1_50_000_00], ['vehicles', 8_00_000_00], ['acc', -(18_100_00 + 1_20_000_00)]]),
      accumulatedAccountId: 'acc',
    })
    expect(ok.matches).toBe(true)
    const off = reconcileAssetRegister({ assets, ledgerBalances: new Map([['fa', 1_50_000_00], ['vehicles', 8_00_000_00]]), accumulatedAccountId: 'acc' })
    expect(off.matches).toBe(false)
    expect(off.accumulated.differenceMinor).toBe(-(18_100_00 + 1_20_000_00))
  })
})
