import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { tenantDb } from '../src/server/db/tenant-client'
import type { AppContext } from '../src/server/context'

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers(),
}))

const { signDrill, verifyDrill, drillHref } = await import('../src/server/drill/descriptor')
const { resolveDrill, DRILL_ROWS_PER_PAGE } = await import('../src/server/drill/service')
const { balanceSheet, defaultRange, profitAndLoss } = await import('../src/server/modules/accounts/service')
const { feeReportsSummary } = await import('../src/server/modules/finance/simplicity')

/**
 * The drill-down promise: whatever figure a report shows, the drill opens to
 * exactly that figure, and the entries it lists add back to it. Read-only on
 * the seeded demo school.
 */
const prisma = new PrismaClient()
let ctx: AppContext
let tenantId: string
let otherTenantId: string

function contextFor(id: string, held: string[]): AppContext {
  const set = new Set(held)
  return {
    user: {
      sessionId: 's_test', userId: 'u_test', tenantId: id, isSuperAdmin: false,
      firstName: 'Drill', lastName: 'Tester', email: null, phone: null, avatarUrl: null, displayName: null,
      mustChangePassword: false, roleKeys: ['SCHOOL_ADMIN'], permissions: set, impersonatedById: null,
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

beforeAll(async () => {
  const [demo, other] = await Promise.all([
    prisma.tenant.findFirstOrThrow({ where: { slug: 'demo' }, select: { id: true } }),
    prisma.tenant.findFirstOrThrow({ where: { slug: { not: 'demo' } }, select: { id: true } }),
  ])
  tenantId = demo.id
  otherTenantId = other.id
  ctx = contextFor(tenantId, ['accounts.view', 'fees.report'])
})

afterAll(async () => {
  await prisma.$disconnect()
})

const RANGES = [defaultRange(), { from: '2025-04-01', to: '2026-03-31' }]

describe('drill descriptor', () => {
  it('round-trips a signed descriptor for the same school', () => {
    const d = { k: 'group', g: 'income', f: '2026-04-01', t: '2026-10-15' } as const
    expect(verifyDrill(tenantId, signDrill(tenantId, d))).toEqual(d)
  })

  it('refuses a link signed for another school', () => {
    const token = signDrill(otherTenantId, { k: 'fee-collected' })
    expect(verifyDrill(tenantId, token)).toBeNull()
  })

  it('refuses a tampered payload or signature', () => {
    const token = signDrill(tenantId, { k: 'fee-collected', m: 'CASH' })
    const [payload, sig] = token.split('.')
    const forged = Buffer.from(JSON.stringify({ k: 'fee-collected', m: 'UPI' })).toString('base64url')
    expect(verifyDrill(tenantId, `${forged}.${sig}`)).toBeNull()
    expect(verifyDrill(tenantId, `${payload}.${sig!.slice(0, -1)}A`)).toBeNull()
    expect(verifyDrill(tenantId, 'garbage')).toBeNull()
    expect(verifyDrill(tenantId, undefined)).toBeNull()
  })

  it('refuses a descriptor outside the whitelist', () => {
    expect(() => signDrill(tenantId, { k: 'sql', q: 'select 1' } as never)).toThrow()
    expect(() => signDrill(tenantId, { k: 'fee-collected', m: 'BITCOIN' } as never)).toThrow()
  })

  it('builds hrefs to the drill page', () => {
    expect(drillHref(tenantId, { k: 'fee-billed' })).toMatch(/^\/accounts\/drill\?d=[\w-]+\.[\w-]+$/)
  })
})

describe('accounts drill totals equal the statements', () => {
  for (const range of RANGES) {
    it(`Profit & Loss groups and results (${range.from} to ${range.to})`, async () => {
      const pl = await profitAndLoss(ctx, range)
      const expected = { income: pl.incomeMinor, direct: pl.directMinor, indirect: pl.indirectMinor, expenses: pl.expenseMinor } as const
      for (const [g, figure] of Object.entries(expected)) {
        const view = await resolveDrill(ctx, { k: 'group', g: g as keyof typeof expected, f: range.from, t: range.to })
        expect(view.valueMinor, g).toBe(figure)
        expect(view.check.figureMinor, g).toBe(figure)
        expect(view.check.recomputedMinor, g).toBe(figure)
      }
      const gross = await resolveDrill(ctx, { k: 'surplus', l: 'gross', f: range.from, t: range.to })
      const net = await resolveDrill(ctx, { k: 'surplus', l: 'net', f: range.from, t: range.to })
      expect([gross.valueMinor, gross.check.recomputedMinor]).toEqual([pl.grossSurplusMinor, pl.grossSurplusMinor])
      expect([net.valueMinor, net.check.recomputedMinor]).toEqual([pl.surplusMinor, pl.surplusMinor])
      expect(net.derivation.at(-1)?.minor).toBe(pl.surplusMinor)
    })

    it(`every P&L ledger opens to its own amount (${range.from} to ${range.to})`, async () => {
      const pl = await profitAndLoss(ctx, range)
      for (const row of [...pl.income, ...pl.expenses]) {
        const view = await resolveDrill(ctx, { k: 'ledger', a: row.id, f: range.from, t: range.to, v: 'period' })
        expect(view.valueMinor, row.name).toBe(row.amountMinor)
        expect(view.check.recomputedMinor, row.name).toBe(row.amountMinor)
      }
    })
  }

  it('Balance Sheet totals and every line', async () => {
    const asOf = defaultRange().to
    const bs = await balanceSheet(ctx, { asOf })
    const assets = await resolveDrill(ctx, { k: 'group', g: 'assets', t: asOf })
    const funds = await resolveDrill(ctx, { k: 'group', g: 'funds', t: asOf })
    expect([assets.valueMinor, assets.check.recomputedMinor]).toEqual([bs.assetsMinor, bs.assetsMinor])
    expect([funds.valueMinor, funds.check.recomputedMinor]).toEqual([bs.fundsMinor, bs.fundsMinor])
    for (const row of [...bs.assets, ...bs.liabilities, ...bs.equity]) {
      const view = await resolveDrill(ctx, { k: 'ledger', a: row.id, t: asOf, v: 'closing' })
      expect(view.valueMinor, row.name).toBe(row.amountMinor)
      expect(view.check.recomputedMinor, row.name).toBe(row.amountMinor)
    }
  })
})

describe('fee drill totals equal the fee report', () => {
  const periods: { f?: string; t?: string }[] = [{}, { f: '2025-04-01', t: '2026-03-31' }, { f: defaultRange().from, t: defaultRange().to }]
  for (const p of periods) {
    it(`billed, collected, outstanding and each mode (${p.f ?? 'all'} to ${p.t ?? 'all'})`, async () => {
      const summary = await feeReportsSummary(ctx, p.f, p.t)
      const billed = await resolveDrill(ctx, { k: 'fee-billed', ...p })
      const collected = await resolveDrill(ctx, { k: 'fee-collected', ...p })
      const outstanding = await resolveDrill(ctx, { k: 'fee-outstanding', ...p })
      expect([billed.valueMinor, billed.check.recomputedMinor]).toEqual([summary.billedMinor, summary.billedMinor])
      expect([collected.valueMinor, collected.check.recomputedMinor]).toEqual([summary.collectedMinor, summary.collectedMinor])
      expect([outstanding.valueMinor, outstanding.check.recomputedMinor]).toEqual([summary.outstandingMinor, summary.outstandingMinor])
      for (const m of summary.byMode) {
        const view = await resolveDrill(ctx, { k: 'fee-collected', ...p, m: m.mode })
        expect(view.check.recomputedMinor, m.mode).toBe(m._sum.amountMinor ?? 0)
        expect(view.totalRows, m.mode).toBe(m._count._all)
      }
    })
  }

  it('pages the register without losing rows', async () => {
    const first = await resolveDrill(ctx, { k: 'fee-collected' }, 1)
    expect(first.rows.length).toBe(Math.min(first.totalRows, DRILL_ROWS_PER_PAGE))
    if (first.totalRows > DRILL_ROWS_PER_PAGE) {
      const second = await resolveDrill(ctx, { k: 'fee-collected' }, 2)
      expect(second.rows.length).toBe(Math.min(first.totalRows - DRILL_ROWS_PER_PAGE, DRILL_ROWS_PER_PAGE))
      const ids = new Set(first.rows.map((r) => r.id))
      expect(second.rows.some((r) => ids.has(r.id))).toBe(false)
    }
  })
})

describe('drill permissions', () => {
  it('needs fees.report for fee figures and accounts.view for ledgers', async () => {
    const accountsOnly = contextFor(tenantId, ['accounts.view'])
    const feesOnly = contextFor(tenantId, ['fees.report'])
    await expect(resolveDrill(accountsOnly, { k: 'fee-collected' })).rejects.toThrow(/fees\.report/)
    await expect(resolveDrill(feesOnly, { k: 'group', g: 'income', t: '2026-10-15' })).rejects.toThrow(/accounts\.view/)
    await expect(resolveDrill(feesOnly, { k: 'fee-billed' })).resolves.toBeTruthy()
  })

  it('cannot read another school’s ledger even with a valid id', async () => {
    const foreign = await prisma.ledgerAccount.findFirst({ where: { tenantId: otherTenantId }, select: { id: true } })
    if (!foreign) return
    await expect(resolveDrill(ctx, { k: 'ledger', a: foreign.id, t: '2026-10-15', v: 'closing' })).rejects.toThrow()
  })
})
