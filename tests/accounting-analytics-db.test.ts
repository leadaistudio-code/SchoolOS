import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Prisma, PrismaClient } from '@prisma/client'
import { tenantDb } from '../src/server/db/tenant-client'
import type { AppContext } from '../src/server/context'
import { writeJournalEntry } from '../src/server/modules/accounts/posting'
import { profitAndLoss } from '../src/server/modules/accounts/service'
import { getAnalyticsDashboard, getDrilldown, refreshLedgerSummary } from '../src/server/modules/accounting/analytics-service'

vi.mock('@/server/modules/accounting/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/server/modules/accounting/service')>()
  return {
    ...actual,
    getAccountingFlags: vi.fn(async () => ({ module: true, studentLedger: false, approvals: false, whatsappReceipts: false, fiscalYearStartMonth: 4 })),
  }
})

/**
 * The analytics promise: every chart figure equals what the journal and the
 * registers say, a new posting shows on the next load (in the month it is
 * dated, not the month it was typed), anything that cannot be accounted for
 * triggers a full rebuild, and the summary stays fast at school scale.
 */
const prisma = new PrismaClient()
const TAG = `ZZBI${Date.now().toString(36)}`

let tenantId: string
let ctx: AppContext
let cashId: string
let expenseId: string
let incomeId: string
const createdEntryIds: string[] = []

function contextFor(id: string, held: string[]): AppContext {
  const set = new Set(held)
  return {
    user: {
      sessionId: 's_test',
      userId: 'u_test',
      tenantId: id,
      isSuperAdmin: false,
      firstName: 'Analytics',
      lastName: 'Tester',
      email: null,
      phone: null,
      avatarUrl: null,
      displayName: null,
      mustChangePassword: false,
      roleKeys: ['SCHOOL_ADMIN'],
      permissions: set,
      impersonatedById: null,
    },
    tenant: { id, name: 'Test School', currency: 'INR' } as never,
    db: tenantDb(id),
    can: (p: string) => set.has(p),
    canAny: (...ps: string[]) => ps.some((p) => set.has(p)),
    require: (p: string) => {
      if (!set.has(p)) throw new Error(`Missing permission: ${p}`)
    },
  }
}

async function post(date: string, amountMinor: number, narration: string) {
  const entry = await tenantDb(tenantId).$transaction((tx) =>
    writeJournalEntry(tx, tenantId, {
      date: new Date(`${date}T00:00:00.000Z`),
      voucherType: 'PAYMENT',
      narration: `${TAG} ${narration}`,
      reference: null,
      lines: [
        { accountId: expenseId, debitMinor: amountMinor, creditMinor: 0 },
        { accountId: cashId, debitMinor: 0, creditMinor: amountMinor },
      ],
      sourceType: 'MANUAL',
      sourceId: null,
      postingKey: null,
    }),
  )
  createdEntryIds.push(entry.id)
  return entry
}

async function removeEntries(ids: string[]) {
  if (!ids.length) return
  await prisma.journalLine.deleteMany({ where: { entryId: { in: ids } } })
  await prisma.journalEntry.deleteMany({ where: { id: { in: ids } } })
}

type Cell = { month: string; accountId: string; sourceType: string; debit: number; credit: number; lines: number }
const cellKey = (c: Cell) => `${c.month}|${c.accountId}|${c.sourceType}`

/** Summary vs a live GROUP BY over the journal, inside one snapshot. Null if the journal moved meanwhile. */
async function summaryDifferences(): Promise<string[] | null> {
  return prisma.$transaction(
    async (tx) => {
      const state = await tx.ledgerSummaryState.findUnique({ where: { tenantId } })
      const count = await tx.journalEntry.count({ where: { tenantId } })
      if (!state || state.entryCount !== count) return null
      const live = await tx.$queryRawUnsafe<Cell[]>(
        `SELECT to_char(date_trunc('month', e."date"), 'YYYY-MM') AS month, l."accountId", e."sourceType"::text AS "sourceType",
                SUM(l."debitMinor")::float8 AS debit, SUM(l."creditMinor")::float8 AS credit, COUNT(*)::int AS lines
         FROM "JournalEntry" e JOIN "JournalLine" l ON l."entryId" = e."id"
         WHERE e."tenantId" = $1 GROUP BY 1, 2, 3`,
        tenantId,
      )
      const summary = await tx.$queryRawUnsafe<Cell[]>(
        `SELECT to_char("month", 'YYYY-MM') AS month, "accountId", "sourceType"::text AS "sourceType",
                "debitMinor"::float8 AS debit, "creditMinor"::float8 AS credit, "lineCount" AS lines
         FROM "LedgerMonthSummary" WHERE "tenantId" = $1`,
        tenantId,
      )
      const want = new Map(live.map((c) => [cellKey(c), c]))
      const got = new Map(summary.map((c) => [cellKey(c), c]))
      const diffs: string[] = []
      for (const [k, c] of want) {
        const s = got.get(k)
        if (!s || s.debit !== c.debit || s.credit !== c.credit || s.lines !== c.lines) diffs.push(`${k}: live ${c.debit}/${c.credit}/${c.lines} summary ${s?.debit}/${s?.credit}/${s?.lines}`)
      }
      for (const k of got.keys()) if (!want.has(k)) diffs.push(`${k}: in summary only`)
      return diffs
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  )
}

async function expectSummaryMatchesJournal() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const diffs = await summaryDifferences()
    if (diffs) {
      expect(diffs).toEqual([])
      return
    }
    await refreshLedgerSummary(tenantId)
  }
  throw new Error('Journal kept changing; could not compare')
}

beforeAll(async () => {
  const demo = await prisma.tenant.findUnique({ where: { slug: 'demo' } })
  if (!demo) throw new Error('Seed the database first: npm run db:seed')
  tenantId = demo.id
  ctx = contextFor(tenantId, ['accounts.view', 'accounts.manage', 'fees.accounts'])
  const accounts = await prisma.ledgerAccount.findMany({ where: { tenantId, systemKey: { in: ['CASH', 'EXP_OTHER', 'OTHER_FEE_INCOME'] } } })
  const by = new Map(accounts.map((a) => [a.systemKey, a.id]))
  cashId = by.get('CASH')!
  expenseId = by.get('EXP_OTHER')!
  incomeId = by.get('OTHER_FEE_INCOME')!
  if (!cashId || !expenseId || !incomeId) throw new Error('Demo chart of accounts is missing CASH / EXP_OTHER / OTHER_FEE_INCOME')
})

afterAll(async () => {
  await removeEntries(createdEntryIds)
  const synthetic = await prisma.journalEntry.findMany({ where: { tenantId, number: { startsWith: TAG } }, select: { id: true } })
  await removeEntries(synthetic.map((e) => e.id))
  await refreshLedgerSummary(tenantId, { force: true })
  await prisma.$disconnect()
})

describe('ledger summary (database)', () => {
  it('a full rebuild reproduces the journal exactly, month by month', async () => {
    const out = await refreshLedgerSummary(tenantId, { force: true })
    expect(out.mode).toBe('full')
    await expectSummaryMatchesJournal()
  })

  it('does nothing when no entry is new', async () => {
    await refreshLedgerSummary(tenantId)
    const out = await refreshLedgerSummary(tenantId)
    expect(out.mode).toBe('none')
  })

  it('folds a back-dated posting into the month it is dated, and only that month', async () => {
    const before = await getDrilldown(ctx, { metric: 'cash_flow', key: 'manual' }, { from: '2026-05', to: '2026-05' })
    await post('2026-05-15', 1_234_00, 'back-dated repair')
    const out = await refreshLedgerSummary(tenantId)
    expect(out).toMatchObject({ mode: 'incremental', monthsRefreshed: 1 })
    await expectSummaryMatchesJournal()

    const after = await getDrilldown(ctx, { metric: 'cash_flow', key: 'manual' }, { from: '2026-05', to: '2026-05' })
    expect(after.valueMinor - before.valueMinor).toBe(-1_234_00)
    expect(after.total).toBe(before.total + 1)
    expect(after.reconciliation.every((r) => r.matches)).toBe(true)
  })

  it('rebuilds in full when an entry disappears, instead of trusting stale totals', async () => {
    const entry = await post('2026-06-10', 500_00, 'to be deleted')
    expect((await refreshLedgerSummary(tenantId)).mode).toBe('incremental')
    await removeEntries([entry.id])
    createdEntryIds.splice(createdEntryIds.indexOf(entry.id), 1)
    expect((await refreshLedgerSummary(tenantId)).mode).toBe('full')
    await expectSummaryMatchesJournal()
  })

  it('two refreshes at once leave a correct summary', async () => {
    await post('2026-07-01', 99_00, 'concurrent')
    const outcomes = await Promise.all([refreshLedgerSummary(tenantId), refreshLedgerSummary(tenantId)])
    expect(outcomes.map((o) => o.mode).sort()).not.toContain('failed')
    expect(outcomes.some((o) => o.mode === 'incremental')).toBe(true)
    await refreshLedgerSummary(tenantId)
    await expectSummaryMatchesJournal()
  })
})

describe('analytics dashboard (database)', () => {
  it('every widget reconciles with its ledger or register', async () => {
    const period = { from: '2026-04', to: '2026-10' }
    const dash = await getAnalyticsDashboard(ctx, period)
    const pl = await profitAndLoss(ctx, { from: dash.period.from, to: dash.period.to })
    expect(dash.expenses.totalMinor).toBe(pl.expenseMinor)
    expect(dash.cashFlow.groups.reduce((s, g) => s + g.netMinor, 0)).toBe(dash.cashFlow.netMinor)

    const cash = await getDrilldown(ctx, { metric: 'cash_flow', key: 'all' }, period)
    expect(cash.reconciliation.map((r) => [r.label, r.matches])).toEqual(cash.reconciliation.map((r) => [r.label, true]))
    expect(cash.valueMinor).toBe(dash.cashFlow.netMinor)

    const expenses = await getDrilldown(ctx, { metric: 'expense', key: 'all' }, period)
    expect(expenses.reconciliation.every((r) => r.matches)).toBe(true)
    expect(expenses.valueMinor).toBe(dash.expenses.totalMinor)

    for (const head of dash.expenses.heads.slice(0, 3)) {
      const d = await getDrilldown(ctx, { metric: 'expense', key: head.id }, period)
      expect(d.valueMinor).toBe(head.amountMinor)
      expect(d.reconciliation.every((r) => r.matches)).toBe(true)
    }

    expect(dash.aging).not.toBeNull()
    for (const bucket of dash.aging!.buckets) {
      const d = await getDrilldown(ctx, { metric: 'aging', key: bucket.key }, period)
      expect(d.valueMinor).toBe(bucket.amountMinor)
      expect(d.total).toBe(bucket.invoices)
      expect(d.reconciliation.every((r) => r.matches)).toBe(true)
    }

    for (const point of dash.wdv.points) {
      const d = await getDrilldown(ctx, { metric: 'wdv', key: point.month }, period)
      expect(d.valueMinor).toBe(point.wdvMinor)
      expect(d.reconciliation[0]!.matches).toBe(true)
    }
  })

  it('paginates drilldowns', async () => {
    const period = { from: '2026-04', to: '2026-10' }
    const first = await getDrilldown(ctx, { metric: 'cash_flow', key: 'all' }, period, '1')
    expect(first.rows.length).toBeLessThanOrEqual(first.pageSize)
    if (first.total > first.pageSize) {
      const second = await getDrilldown(ctx, { metric: 'cash_flow', key: 'all' }, period, '2')
      expect(second.rows[0]!.id).not.toBe(first.rows[0]!.id)
    }
  })

  it('applies the same access rules as the ledgers and fee accounts', async () => {
    const period = { from: '2026-04', to: '2026-10' }
    const ledgerOnly = contextFor(tenantId, ['accounts.view'])
    const dash = await getAnalyticsDashboard(ledgerOnly, period)
    expect(dash.aging).toBeNull()
    await expect(getDrilldown(ledgerOnly, { metric: 'aging', key: 'all' }, period)).rejects.toThrow(/fees\.accounts/)
    await expect(getAnalyticsDashboard(contextFor(tenantId, ['fees.accounts']), period)).rejects.toThrow(/accounts\.view/)
    await expect(getDrilldown(ctx, { metric: 'expense', key: cashId }, period)).rejects.toThrow(/Expense ledger/)
  })

  it('never shows another school’s ledger', async () => {
    const other = await prisma.tenant.findFirst({ where: { id: { not: tenantId } }, select: { id: true } })
    if (!other) return
    await refreshLedgerSummary(other.id)
    const foreign = await prisma.ledgerAccount.findFirst({ where: { tenantId: other.id, type: 'EXPENSE' }, select: { id: true } })
    if (foreign) await expect(getDrilldown(ctx, { metric: 'expense', key: foreign.id }, { from: '2026-04', to: '2026-10' })).rejects.toThrow(/Expense ledger/)
    const leaked = await ctx.db.ledgerMonthSummary.count({ where: { tenantId: other.id } })
    expect(leaked).toBe(await prisma.ledgerMonthSummary.count({ where: { tenantId } }))
  })
})

describe('analytics performance (database)', () => {
  const ENTRIES = 25_000

  it(`stays fast with ${ENTRIES.toLocaleString('en-IN')} journal entries in a year`, async () => {
    const months = ['2019-04', '2019-05', '2019-06', '2019-07', '2019-08', '2019-09', '2019-10', '2019-11', '2019-12', '2020-01', '2020-02', '2020-03']
    const t0 = Date.now()
    for (let start = 0; start < ENTRIES; start += 5_000) {
      const entries: Prisma.JournalEntryCreateManyInput[] = []
      const lines: Prisma.JournalLineCreateManyInput[] = []
      for (let i = start; i < Math.min(ENTRIES, start + 5_000); i++) {
        const id = `${TAG}e${i}`
        const amount = 1_000_00 + (i % 97) * 100_00
        const month = months[i % months.length]!
        const day = String(1 + (i % 28)).padStart(2, '0')
        const fee = i % 5 !== 0
        entries.push({ id, tenantId, number: `${TAG}-${i}`, date: new Date(`${month}-${day}T00:00:00.000Z`), totalMinor: amount, sourceType: fee ? 'FEE_PAYMENT' : 'EXPENSE', voucherType: fee ? 'RECEIPT' : 'PAYMENT' })
        lines.push(
          { id: `${id}a`, tenantId, entryId: id, accountId: fee ? cashId : expenseId, debitMinor: amount, creditMinor: 0 },
          { id: `${id}b`, tenantId, entryId: id, accountId: fee ? incomeId : cashId, debitMinor: 0, creditMinor: amount },
        )
      }
      await prisma.journalEntry.createMany({ data: entries })
      await prisma.journalLine.createMany({ data: lines })
    }
    const seedMs = Date.now() - t0

    const full = await refreshLedgerSummary(tenantId, { force: true })
    expect(full.mode).toBe('full')

    const extra = `${TAG}e-extra`
    await prisma.journalEntry.create({ data: { id: extra, tenantId, number: `${TAG}-extra`, date: new Date('2019-11-20T00:00:00.000Z'), totalMinor: 777_00, sourceType: 'EXPENSE', voucherType: 'PAYMENT' } })
    await prisma.journalLine.createMany({
      data: [
        { tenantId, entryId: extra, accountId: expenseId, debitMinor: 777_00, creditMinor: 0 },
        { tenantId, entryId: extra, accountId: cashId, debitMinor: 0, creditMinor: 777_00 },
      ],
    })
    const incremental = await refreshLedgerSummary(tenantId)
    expect(incremental).toMatchObject({ mode: 'incremental', monthsRefreshed: 1 })

    const t1 = Date.now()
    const dash = await getAnalyticsDashboard(ctx, { from: '2019-04', to: '2020-03' })
    const dashboardMs = Date.now() - t1
    const t2 = Date.now()
    const drill = await getDrilldown(ctx, { metric: 'cash_flow', key: 'fees' }, { from: '2019-04', to: '2020-03' }, '40')
    const drillMs = Date.now() - t2

    expect(dash.cashFlow.groups.find((g) => g.key === 'fees')!.lines).toBeGreaterThanOrEqual(ENTRIES * 0.8)
    expect(drill.reconciliation.every((r) => r.matches)).toBe(true)
    await expectSummaryMatchesJournal()

    console.info(
      `[analytics perf] ${ENTRIES} entries / ${ENTRIES * 2} lines seeded in ${seedMs} ms; full rebuild ${full.durationMs} ms; ` +
        `incremental (1 month) ${incremental.durationMs} ms; dashboard ${dashboardMs} ms; drilldown page 40 ${drillMs} ms`,
    )
    expect(full.durationMs).toBeLessThan(20_000)
    expect(incremental.durationMs).toBeLessThan(3_000)
    expect(dashboardMs).toBeLessThan(5_000)
    expect(drillMs).toBeLessThan(5_000)
  }, 180_000)
})
