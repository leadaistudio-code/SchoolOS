import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { runIntegrityChecks, type IntegrityResult } from '../src/server/modules/accounting/integrity'

/**
 * The integrity checks must catch what they claim to: each broken rule is
 * planted in a throwaway school, which is deleted afterwards.
 */
const prisma = new PrismaClient()
const TAG = `zzint${Date.now().toString(36)}`

let tenantId: string
let results: IntegrityResult[]
let n = 0
const planted: Record<string, string> = {}

async function entry(lines: { accountId: string; debitMinor: number; creditMinor: number }[], extra: Record<string, unknown> = {}) {
  n += 1
  return prisma.journalEntry.create({
    data: {
      tenantId,
      number: `${TAG}-${n}`,
      date: new Date('2026-05-10T00:00:00.000Z'),
      totalMinor: lines.reduce((s, l) => s + l.debitMinor, 0),
      ...extra,
      lines: { create: lines.map((l) => ({ tenantId, ...l })) },
    },
  })
}

function findings(name: string) {
  const r = results.find((x) => x.name === name)
  if (!r) throw new Error(`no check named ${name}`)
  return r.rows.filter((row) => row.tenantId === tenantId)
}

beforeAll(async () => {
  tenantId = (await prisma.tenant.create({ data: { slug: TAG, name: `Integrity test ${TAG}` } })).id
  const cash = await prisma.ledgerAccount.create({ data: { tenantId, code: `${TAG}-C`, name: 'Cash', type: 'ASSET' } })
  const fees = await prisma.ledgerAccount.create({ data: { tenantId, code: `${TAG}-F`, name: 'Fees', type: 'INCOME', openingBalanceMinor: -500 } })
  const elsewhere = await prisma.ledgerAccount.findFirst({ where: { tenantId: { not: tenantId } }, select: { id: true } })

  // A balanced, correct voucher and a correct reversal pair: no findings.
  await entry([{ accountId: cash.id, debitMinor: 100, creditMinor: 0 }, { accountId: fees.id, debitMinor: 0, creditMinor: 100 }])
  const original = await entry([{ accountId: cash.id, debitMinor: 70, creditMinor: 0 }, { accountId: fees.id, debitMinor: 0, creditMinor: 70 }], { reversedAt: new Date() })
  await entry([{ accountId: fees.id, debitMinor: 70, creditMinor: 0 }, { accountId: cash.id, debitMinor: 0, creditMinor: 70 }], { isReversal: true, reversalOfId: original.id })

  // Planted faults.
  planted.unbalanced = (await entry([{ accountId: cash.id, debitMinor: 100, creditMinor: 0 }, { accountId: fees.id, debitMinor: 0, creditMinor: 90 }])).number
  await entry([{ accountId: cash.id, debitMinor: 50, creditMinor: 50 }, { accountId: fees.id, debitMinor: 0, creditMinor: 0 }])
  if (elsewhere) await entry([{ accountId: elsewhere.id, debitMinor: 10, creditMinor: 0 }, { accountId: fees.id, debitMinor: 0, creditMinor: 10 }])
  for (let i = 0; i < 2; i++) {
    await entry([{ accountId: cash.id, debitMinor: 30, creditMinor: 0 }, { accountId: fees.id, debitMinor: 0, creditMinor: 30 }], { sourceType: 'FEE_PAYMENT', sourceId: `${TAG}-payment` })
  }
  planted.unreversed = (await entry([{ accountId: cash.id, debitMinor: 20, creditMinor: 0 }, { accountId: fees.id, debitMinor: 0, creditMinor: 20 }], { reversedAt: new Date() })).number
  const halfOriginal = await entry([{ accountId: cash.id, debitMinor: 40, creditMinor: 0 }, { accountId: fees.id, debitMinor: 0, creditMinor: 40 }], { reversedAt: new Date() })
  planted.partialReversal = (await entry([{ accountId: fees.id, debitMinor: 30, creditMinor: 0 }, { accountId: cash.id, debitMinor: 0, creditMinor: 30 }], { isReversal: true, reversalOfId: halfOriginal.id })).number

  await prisma.accountingFiscalYear.create({
    data: { tenantId, label: '2026-27', startsOn: new Date('2026-04-01T00:00:00.000Z'), endsOn: new Date('2027-03-31T00:00:00.000Z'), status: 'CLOSED', closedAt: new Date(Date.now() - 86_400_000), lockedThrough: new Date('2026-06-30T00:00:00.000Z'), lockedAt: new Date(Date.now() - 86_400_000) },
  })

  // A summary last refreshed before every entry above, holding one row the journal does not have.
  await prisma.ledgerSummaryState.create({ data: { tenantId, watermark: new Date('2000-01-01T00:00:00.000Z'), refreshedAt: new Date('2000-01-01T00:00:00.000Z') } })
  await prisma.ledgerMonthSummary.create({ data: { tenantId, month: new Date('2026-05-01T00:00:00.000Z'), accountId: cash.id, sourceType: 'MANUAL', debitMinor: 999n } })

  results = await runIntegrityChecks(prisma)
})

afterAll(async () => {
  if (tenantId) {
    await prisma.journalLine.deleteMany({ where: { tenantId } })
    await prisma.journalEntry.deleteMany({ where: { tenantId } })
    await prisma.ledgerAccount.deleteMany({ where: { tenantId } })
    await prisma.accountingFiscalYear.deleteMany({ where: { tenantId } })
    await prisma.ledgerMonthSummary.deleteMany({ where: { tenantId } })
    await prisma.ledgerSummaryState.deleteMany({ where: { tenantId } })
    await prisma.tenant.delete({ where: { id: tenantId } })
  }
  await prisma.$disconnect()
})

describe('accounting integrity checks', () => {
  it('flag an unbalanced voucher and a two-sided line', () => {
    expect(findings('Voucher debits equal credits and the voucher total, with 2+ lines').map((r) => r.detail)).toEqual([`${planted.unbalanced}: Dr 100 Cr 90 total 100 lines 2`])
    expect(findings('Each line is one-sided and non-negative')).toHaveLength(2)
  })

  it('flag a line that uses another school\'s account', () => {
    expect(findings('Lines reference an account of the same school as their voucher').length).toBeGreaterThanOrEqual(1)
  })

  it('flag a source posted twice', () => {
    expect(findings('Each source document has at most one posting in force').map((r) => r.detail)).toEqual([`FEE_PAYMENT ${TAG}-payment x2`])
  })

  it('flag reversals that are missing or do not mirror the original', () => {
    expect(findings('Every reversed voucher has exactly one reversal, and every reversal points at a reversed voucher').map((r) => r.detail))
      .toEqual([`${planted.unreversed} reversed with 0 reversals`])
    expect(findings('Each reversal mirrors its original line for line').map((r) => r.detail)).toEqual([planted.partialReversal])
  })

  it('flag vouchers created in a closed year or a locked period', () => {
    expect(findings('No voucher was created in a financial year after it was closed')).toHaveLength(n)
    expect(findings('No voucher was created inside a locked period after it was locked')).toHaveLength(n)
  })

  it('compare the analytics summary only with entries up to its last refresh', () => {
    expect(findings('Analytics month summary equals the journal up to its last refresh (schools with a summary)').map((r) => r.detail))
      .toEqual(['2026-05-01 MANUAL'])
  })

  it('report unbalanced opening balances as information', () => {
    const r = results.find((x) => x.name.startsWith('Opening balances'))!
    expect(r.kind).toBe('info')
    expect(r.rows.filter((row) => row.tenantId === tenantId).map((row) => row.detail)).toEqual(['net opening -500'])
  })
})
