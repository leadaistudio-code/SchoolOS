import { describe, expect, it } from 'vitest'
import { financialYearRange } from '@/lib/periods'
import { financialYearLabel } from '@/server/numbering'
import { isTenantScoped } from '@/server/db/tenant-models'
import { MAX_MINOR, isValidMinor, minorToDecimalString, parseMoneyToMinor } from '@/server/modules/accounting/money'
import {
  checkPostingDate,
  fiscalYearOf,
  fiscalYearStartingIn,
  isIsoDate,
  recentFiscalYears,
  type FiscalYearState,
} from '@/server/modules/accounting/fiscal-year'
import { ledgerVoucherType, validateVoucher, type VoucherDraft } from '@/server/modules/accounting/voucher'
import { ACCOUNTING_OFF, resolveAccountingFlags } from '@/server/modules/accounting/flags'
import { getAccountingFlags } from '@/server/modules/accounting/service'

const CASH = 'acc_cash'
const FEES = 'acc_fee_income'
const RENT = 'acc_rent'
const mySchool = new Set([CASH, FEES, RENT])

function voucher(lines: VoucherDraft['lines'], extra: Partial<VoucherDraft> = {}): VoucherDraft {
  return { kind: 'JOURNAL', date: '2026-10-13', narration: 'Test voucher', lines, ...extra }
}

const codes = (draft: VoucherDraft, accounts: ReadonlySet<string> = mySchool) => {
  const result = validateVoucher(draft, accounts)
  return result.ok ? [] : result.issues.map((i) => i.code)
}

describe('money precision', () => {
  it('parses rupee text into exact paise without floating point', () => {
    expect(parseMoneyToMinor('0.1')).toBe(10)
    expect(parseMoneyToMinor('0.29')).toBe(29)
    expect(parseMoneyToMinor('1,250.5')).toBe(125050)
    expect(parseMoneyToMinor('₹ 99')).toBe(9900)
    expect(parseMoneyToMinor('Rs. 1,00,000.75')).toBe(10000075)
    expect(parseMoneyToMinor(19.99)).toBe(1999)
  })

  it('rejects negatives, extra decimals, junk and overflow', () => {
    expect(parseMoneyToMinor('-5')).toBeNull()
    expect(parseMoneyToMinor('1.005')).toBeNull()
    expect(parseMoneyToMinor('abc')).toBeNull()
    expect(parseMoneyToMinor('')).toBeNull()
    expect(parseMoneyToMinor(Number.NaN)).toBeNull()
    expect(parseMoneyToMinor('21474836.48')).toBeNull()
    expect(parseMoneyToMinor('21474836.47')).toBe(MAX_MINOR)
  })

  it('round-trips paise to a decimal string', () => {
    expect(minorToDecimalString(123456)).toBe('1234.56')
    expect(minorToDecimalString(5)).toBe('0.05')
    expect(minorToDecimalString(-250)).toBe('-2.50')
    for (const minor of [0, 1, 99, 100, 101, 999_999, MAX_MINOR]) {
      expect(parseMoneyToMinor(minorToDecimalString(minor))).toBe(minor)
    }
  })

  it('accepts only whole, non-negative paise within the column range', () => {
    expect(isValidMinor(0)).toBe(true)
    expect(isValidMinor(MAX_MINOR)).toBe(true)
    expect(isValidMinor(MAX_MINOR + 1)).toBe(false)
    expect(isValidMinor(10.5)).toBe(false)
    expect(isValidMinor(-1)).toBe(false)
    expect(isValidMinor('100')).toBe(false)
  })
})

describe('voucher balancing', () => {
  it('accepts a balanced voucher and reports its total', () => {
    const result = validateVoucher(
      voucher([
        { accountId: CASH, debitMinor: 50_000, creditMinor: 0 },
        { accountId: FEES, debitMinor: 0, creditMinor: 50_000 },
      ]),
      mySchool,
    )
    expect(result).toEqual({ ok: true, totalMinor: 50_000 })
  })

  it('accepts several debits against several credits when totals agree', () => {
    expect(
      codes(
        voucher([
          { accountId: RENT, debitMinor: 30_000, creditMinor: 0 },
          { accountId: FEES, debitMinor: 20_001, creditMinor: 0 },
          { accountId: CASH, debitMinor: 0, creditMinor: 25_000 },
          { accountId: CASH, debitMinor: 0, creditMinor: 25_001 },
        ]),
      ),
    ).toEqual([])
  })

  it('rejects an unbalanced voucher instead of adding a balancing line', () => {
    const draft = voucher([
      { accountId: CASH, debitMinor: 50_000, creditMinor: 0 },
      { accountId: FEES, debitMinor: 0, creditMinor: 49_999 },
    ])
    const result = validateVoucher(draft, mySchool)
    expect(result.ok).toBe(false)
    expect(codes(draft)).toEqual(['UNBALANCED'])
    expect(draft.lines).toHaveLength(2)
  })

  it('needs at least one debit and one credit line', () => {
    expect(codes(voucher([{ accountId: CASH, debitMinor: 100, creditMinor: 0 }]))).toEqual(
      expect.arrayContaining(['TOO_FEW_LINES', 'UNBALANCED']),
    )
    expect(
      codes(
        voucher([
          { accountId: CASH, debitMinor: 100, creditMinor: 0 },
          { accountId: RENT, debitMinor: 100, creditMinor: 0 },
        ]),
      ),
    ).toEqual(expect.arrayContaining(['NO_CREDIT', 'UNBALANCED']))
  })

  it('rejects lines with both sides, zero, negative or fractional paise', () => {
    expect(codes(voucher([
      { accountId: CASH, debitMinor: 100, creditMinor: 100 },
      { accountId: FEES, debitMinor: 0, creditMinor: 0 },
    ]))).toEqual(expect.arrayContaining(['BOTH_SIDES', 'ZERO_LINE']))
    expect(codes(voucher([
      { accountId: CASH, debitMinor: -100, creditMinor: 0 },
      { accountId: FEES, debitMinor: 0, creditMinor: 100.5 },
    ]))).toEqual(expect.arrayContaining(['INVALID_AMOUNT']))
  })

  it('rejects a total the INTEGER column cannot hold', () => {
    expect(codes(voucher([
      { accountId: CASH, debitMinor: MAX_MINOR, creditMinor: 0 },
      { accountId: RENT, debitMinor: 1, creditMinor: 0 },
      { accountId: FEES, debitMinor: 0, creditMinor: MAX_MINOR },
      { accountId: FEES, debitMinor: 0, creditMinor: 1 },
    ]))).toContain('TOTAL_TOO_LARGE')
  })

  it('checks date, narration and idempotency key', () => {
    const lines = [
      { accountId: CASH, debitMinor: 100, creditMinor: 0 },
      { accountId: FEES, debitMinor: 0, creditMinor: 100 },
    ]
    expect(codes(voucher(lines, { date: '2026-02-30' }))).toContain('INVALID_DATE')
    expect(codes(voucher(lines, { narration: '  ' }))).toContain('NARRATION_REQUIRED')
    expect(codes(voucher(lines, { idempotencyKey: 'bad key!' }))).toContain('INVALID_IDEMPOTENCY_KEY')
    expect(codes(voucher(lines, { idempotencyKey: 'EXPENSE:ck123:v1' }))).toEqual([])
  })

  it('maps TallyPrime voucher kinds onto the ledger voucher types', () => {
    expect(ledgerVoucherType('RECEIPT')).toBe('RECEIPT')
    expect(ledgerVoucherType('PAYMENT')).toBe('PAYMENT')
    expect(ledgerVoucherType('CONTRA')).toBe('CONTRA')
    expect(ledgerVoucherType('DEPRECIATION')).toBe('JOURNAL')
    expect(ledgerVoucherType('DEBIT_NOTE')).toBe('JOURNAL')
  })
})

describe('tenant isolation', () => {
  it('treats another school\'s ledger account as unknown', () => {
    const otherSchoolAccount = 'acc_from_school_b'
    expect(codes(voucher([
      { accountId: CASH, debitMinor: 100, creditMinor: 0 },
      { accountId: otherSchoolAccount, debitMinor: 0, creditMinor: 100 },
    ]))).toEqual(['UNKNOWN_ACCOUNT'])
  })

  it('registers every new accounting table with the tenant guard', () => {
    for (const model of ['AccountingFiscalYear', 'AccountingAuditEvent', 'AccountingSettings']) {
      expect(isTenantScoped(model)).toBe(true)
    }
  })
})

describe('fiscal-year boundaries', () => {
  it('splits April-March years at 31 March / 1 April', () => {
    expect(fiscalYearOf('2026-03-31')).toEqual({ label: '2025-26', startsOn: '2025-04-01', endsOn: '2026-03-31' })
    expect(fiscalYearOf('2026-04-01')).toEqual({ label: '2026-27', startsOn: '2026-04-01', endsOn: '2027-03-31' })
    expect(fiscalYearOf('2027-01-01').label).toBe('2026-27')
  })

  it('agrees with the existing report ranges and receipt-book labels', () => {
    for (const day of ['2024-02-29', '2025-03-31', '2025-04-01', '2026-10-13', '2026-12-31', '2027-01-01']) {
      const fy = fiscalYearOf(day)
      expect({ from: fy.startsOn, to: fy.endsOn }).toEqual(financialYearRange(day))
      expect(financialYearLabel(new Date(`${day}T00:00:00.000Z`))).toBe(`${fy.startsOn.slice(2, 4)}${fy.endsOn.slice(2, 4)}`)
    }
  })

  it('handles Date values from @db.Date columns', () => {
    expect(fiscalYearOf(new Date('2026-04-01T00:00:00.000Z')).label).toBe('2026-27')
  })

  it('supports other start months, including leap-year February ends', () => {
    expect(fiscalYearStartingIn(2026, 1)).toEqual({ label: '2026', startsOn: '2026-01-01', endsOn: '2026-12-31' })
    expect(fiscalYearStartingIn(2027, 3)).toEqual({ label: '2027-28', startsOn: '2027-03-01', endsOn: '2028-02-29' })
    expect(fiscalYearOf('2026-06-30', 7).label).toBe('2025-26')
    expect(() => fiscalYearStartingIn(2026, 13)).toThrow(RangeError)
  })

  it('lists the current year and the three before it for the FY selector', () => {
    expect(recentFiscalYears('2026-10-13', 4).map((y) => y.label)).toEqual(['2026-27', '2025-26', '2024-25', '2023-24'])
    expect(recentFiscalYears('2026-03-31', 2).map((y) => y.label)).toEqual(['2025-26', '2024-25'])
  })

  it('validates calendar dates strictly', () => {
    expect(isIsoDate('2028-02-29')).toBe(true)
    expect(isIsoDate('2026-02-29')).toBe(false)
    expect(isIsoDate('2026-4-1')).toBe(false)
  })
})

describe('posting-date rules', () => {
  const years: FiscalYearState[] = [
    { label: '2025-26', startsOn: '2025-04-01', endsOn: '2026-03-31', status: 'CLOSED', lockedThrough: null },
    { label: '2026-27', startsOn: new Date('2026-04-01T00:00:00Z'), endsOn: new Date('2027-03-31T00:00:00Z'), status: 'LOCKED', lockedThrough: new Date('2026-09-30T00:00:00Z') },
  ]

  it('refuses dates in a closed year', () => {
    expect(checkPostingDate('2026-03-31', years)).toMatchObject({ ok: false, code: 'YEAR_CLOSED' })
  })

  it('refuses dates on or before the lock and allows the day after', () => {
    expect(checkPostingDate('2026-09-30', years)).toMatchObject({ ok: false, code: 'PERIOD_LOCKED' })
    expect(checkPostingDate('2026-10-01', years)).toMatchObject({ ok: true, fiscalYear: { label: '2026-27' } })
  })

  it('treats an unrecorded year as open unless a recorded year is required', () => {
    expect(checkPostingDate('2027-05-01', years)).toMatchObject({ ok: true, fiscalYear: { label: '2027-28' } })
    expect(checkPostingDate('2027-05-01', years, { requireRecordedYear: true })).toMatchObject({ ok: false, code: 'NO_FISCAL_YEAR' })
  })

  it('rejects an invalid date', () => {
    expect(checkPostingDate('2026-13-01', years)).toMatchObject({ ok: false, code: 'INVALID_DATE' })
  })
})

describe('feature flags', () => {
  const allOn = { module: true, studentLedger: true, approvals: true, whatsappReceipts: true }
  const rowAllOn = { studentLedgerEnabled: true, approvalWorkflowEnabled: true, whatsappReceiptsEnabled: true, fiscalYearStartMonth: 4 }

  it('is entirely off when the deployment switch is off, whatever the school chose', () => {
    expect(resolveAccountingFlags({ ...allOn, module: false }, rowAllOn)).toEqual(ACCOUNTING_OFF)
  })

  it('needs both the deployment switch and the school setting for each feature', () => {
    expect(resolveAccountingFlags(allOn, null)).toEqual({ ...ACCOUNTING_OFF, module: true })
    expect(resolveAccountingFlags({ ...allOn, approvals: false }, rowAllOn)).toMatchObject({ studentLedger: true, approvals: false, whatsappReceipts: true })
    expect(resolveAccountingFlags(allOn, { ...rowAllOn, studentLedgerEnabled: false })).toMatchObject({ studentLedger: false })
  })

  it('falls back to April when a stored start month is invalid', () => {
    expect(resolveAccountingFlags(allOn, { ...rowAllOn, fiscalYearStartMonth: 0 }).fiscalYearStartMonth).toBe(4)
  })

  it('defaults to off without touching the database', async () => {
    let reads = 0
    const db = { accountingSettings: { findFirst: async () => { reads++; throw new Error('database down') } } }
    const flags = await getAccountingFlags(db as never)
    expect(flags).toEqual(ACCOUNTING_OFF)
    expect(reads).toBe(0)
  })
})
