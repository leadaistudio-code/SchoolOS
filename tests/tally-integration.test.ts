import { describe, expect, it } from 'vitest'
import {
  escapeXml,
  buildListCompaniesXml,
  buildReceiptVoucherXml,
  parseCompanyNames,
  hasTallyError,
  parseLedgerNames,
  cleanTallyName,
} from '../src/server/integrations/tally/xml'
import { TallyErp9Provider } from '../src/server/integrations/tally/erp9-provider'
import { assertDirectHostAllowed, createMockTransport } from '../src/server/integrations/tally/transport'
import { nameMatchScore, normaliseName } from '../src/server/modules/tally/mappings'
import { TALLY_ERROR, tallyErrorMessage } from '../src/server/integrations/tally/types'
import { buildTrialBalance, defaultPeriod, matchAgainstTally } from '../src/server/modules/tally/trial-balance'

describe('tally xml engine', () => {
  it('escapes XML special characters', () => {
    expect(escapeXml(`A&B <C> "D" 'E'`)).toBe('A&amp;B &lt;C&gt; &quot;D&quot; &apos;E&apos;')
  })

  it('builds a list-of-companies export envelope', () => {
    const xml = buildListCompaniesXml()
    expect(xml).toContain('<TALLYREQUEST>Export</TALLYREQUEST>')
    expect(xml).toContain('<ID>List of Companies</ID>')
  })

  it('builds a balanced receipt voucher import', () => {
    const xml = buildReceiptVoucherXml({
      companyName: 'Demo School',
      date: '20260926',
      voucherType: 'Receipt',
      narration: 'Fee receipt RCP-1',
      lines: [
        { ledgerName: 'Cash', amount: 25000, isDebit: true },
        { ledgerName: 'Tuition Fees', amount: 25000, isDebit: false },
      ],
      remoteReference: 'tenant:FEE_PAYMENT:pay1:Receipt',
    })
    expect(xml).toContain('<TALLYREQUEST>Import</TALLYREQUEST>')
    expect(xml).toContain('<LEDGERNAME>Cash</LEDGERNAME>')
    expect(xml).toContain('<AMOUNT>25000.00</AMOUNT>')
    expect(xml).toContain('<AMOUNT>-25000.00</AMOUNT>')
    expect(xml).toContain('REMOTEALTGUID')
  })

  it('parses company names and line errors', () => {
    expect(parseCompanyNames('<COMPANYNAME>Alpha</COMPANYNAME><COMPANYNAME>Beta</COMPANYNAME>')).toEqual([
      'Alpha',
      'Beta',
    ])
    expect(hasTallyError('<LINEERROR>Unknown ledger</LINEERROR>')?.message).toBe('Unknown ledger')
  })

  it('parses flat ledger name lists', () => {
    const rows = parseLedgerNames('<NAME>Cash</NAME><NAME>Tuition Fees</NAME>')
    expect(rows.map((r) => r.name)).toEqual(['Cash', 'Tuition Fees'])
  })

  it('does not leak the inner tag when names are wrapped in a .LIST element', () => {
    const body =
      '<ENVELOPE><COMPANYNAME.LIST><COMPANYNAME>Apni Pathshala</COMPANYNAME></COMPANYNAME.LIST></ENVELOPE>'
    expect(parseCompanyNames(body)).toEqual(['Apni Pathshala'])
  })

  it('parses ledger collection exports with NAME attributes and parents', () => {
    const body = `<ENVELOPE><BODY><DATA><COLLECTION>
      <LEDGER NAME="Cash" RESERVEDNAME=""><PARENT TYPE="String">Cash-in-Hand</PARENT><GUID>g-1</GUID></LEDGER>
      <LEDGER NAME="Tuition Fees &amp; Charges"><NAME.LIST><NAME>Tuition Fees &amp; Charges</NAME></NAME.LIST><PARENT>Indirect Incomes</PARENT></LEDGER>
    </COLLECTION></DATA></BODY></ENVELOPE>`
    expect(parseLedgerNames(body)).toEqual([
      { name: 'Cash', parent: 'Cash-in-Hand', guid: 'g-1' },
      { name: 'Tuition Fees & Charges', parent: 'Indirect Incomes', guid: null },
    ])
  })

  it('cleans names saved by older connectors', () => {
    expect(cleanTallyName('<COMPANYNAME>Apni Pathshala')).toBe('Apni Pathshala')
    expect(cleanTallyName('   ')).toBeNull()
  })
})

describe('tally erp9 provider (mock transport)', () => {
  it('reports healthy connection when companies are returned', async () => {
    const provider = new TallyErp9Provider(
      createMockTransport(async () => '<COMPANYNAME>Demo School</COMPANYNAME>'),
    )
    const result = await provider.testConnection('Demo School')
    expect(result.ok).toBe(true)
    expect(result.companyLoaded).toBe(true)
  })

  it('reports company not loaded when empty', async () => {
    const provider = new TallyErp9Provider(createMockTransport(async () => '<ENVELOPE></ENVELOPE>'))
    const result = await provider.testConnection()
    expect(result.ok).toBe(false)
    expect(result.errorCode).toBe(TALLY_ERROR.COMPANY_NOT_LOADED)
  })
})

describe('tally security guards', () => {
  it('blocks DIRECT hosts unless TALLY_ALLOW_DIRECT=1', () => {
    const prev = process.env.TALLY_ALLOW_DIRECT
    delete process.env.TALLY_ALLOW_DIRECT
    expect(() => assertDirectHostAllowed('192.168.1.10')).toThrow(/not allowed/i)
    process.env.TALLY_ALLOW_DIRECT = '1'
    expect(() => assertDirectHostAllowed('192.168.1.10')).not.toThrow()
    expect(() => assertDirectHostAllowed('8.8.8.8')).toThrow(/not allowed/i)
    expect(() => assertDirectHostAllowed('169.254.169.254')).toThrow(/not allowed/i)
    process.env.TALLY_ALLOW_DIRECT = prev
  })
})

describe('tally mapping helpers', () => {
  it('scores exact and near ledger names', () => {
    expect(normaliseName('Tuition Fee!!!')).toBe('tuition fee')
    expect(nameMatchScore('Tuition Fee', 'Tuition Fees')).toBeGreaterThanOrEqual(92)
    expect(nameMatchScore('Transport', 'Library Fee')).toBeLessThan(50)
  })

  it('has human error copy', () => {
    expect(tallyErrorMessage(TALLY_ERROR.OFFLINE)).toMatch(/ensure Tally/i)
  })
})

describe('tally trial balance', () => {
  const snapshot = {
    fromDate: '20260401',
    toDate: '20261001',
    groups: [
      { name: 'Direct Incomes', parent: '\u0004 Primary' },
      { name: 'Current Assets', parent: '\u0004 Primary' },
      { name: 'Cash-in-Hand', parent: 'Current Assets' },
    ],
    ledgers: [
      // Tally: negative = Debit
      { name: 'Cash', parent: 'Cash-in-Hand', opening: -1000, closing: -6000 },
      { name: 'Tuition Fee', parent: 'Direct Incomes', opening: 0, closing: 4000 },
      { name: 'Annual Fee', parent: 'Direct Incomes', opening: 0, closing: 2000 },
      { name: 'Capital', parent: '\u0004 Primary', opening: 1000, closing: 0 },
    ],
  }

  it('flips Tally signs to Debit-positive, rolls up primary groups and totals', () => {
    const tb = buildTrialBalance(snapshot)
    expect(tb.fromDate).toBe('2026-04-01')
    const cash = tb.rows.find((r) => r.name === 'Cash')!
    expect(cash).toMatchObject({ primaryGroup: 'Current Assets', openingMinor: 100000, changeMinor: 500000, closingMinor: 600000 })
    expect(tb.rows.find((r) => r.name === 'Tuition Fee')!.closingMinor).toBe(-400000)
    expect(tb.rows.find((r) => r.name === 'Capital')!.primaryGroup).toBe('Primary')
    expect(tb.totals.closingDrMinor).toBe(600000)
    expect(tb.totals.closingCrMinor).toBe(600000)
    expect(tb.totals.differenceMinor).toBe(0)
  })

  it('classifies matched, not-posted, mismatched and missing ledgers', () => {
    const tb = buildTrialBalance(snapshot)
    const e = (mcvMinor: number, postedMinor: number) => ({ mcvMinor, postedMinor, basis: new Set(['x']) })
    const rows = matchAgainstTally(tb, {
      credit: new Map([
        ['Tuition Fee', e(400000, 400000)],
        ['Annual Fee', e(300000, 200000)],
        ['Exam Fee', e(5000, 0)],
      ]),
      debit: new Map([['Cash', e(450000, 450000)]]),
    })
    const status = Object.fromEntries(rows.map((r) => [`${r.side}:${r.ledgerName}`, r.status]))
    expect(status).toEqual({
      'CREDIT:Tuition Fee': 'MATCHED',
      'CREDIT:Annual Fee': 'NOT_POSTED',
      'CREDIT:Exam Fee': 'MISSING_IN_TALLY',
      'DEBIT:Cash': 'MISMATCH',
    })
    expect(rows.find((r) => r.ledgerName === 'Cash')!.differenceMinor).toBe(50000)
  })

  it('defaults to the Indian financial year', () => {
    expect(defaultPeriod(new Date('2026-10-01T00:00:00Z'))).toEqual({ from: '2026-04-01', to: '2026-10-01' })
    expect(defaultPeriod(new Date('2027-02-10T00:00:00Z')).from).toBe('2026-04-01')
  })
})
