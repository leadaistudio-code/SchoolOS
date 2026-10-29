import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// Deployment switches are read once by env(); set them before anything reads it.
const saved = vi.hoisted(() => {
  const prev = { module: process.env.ACCOUNTING_MODULE_ENABLED }
  process.env.ACCOUNTING_MODULE_ENABLED = 'true'
  return prev
})

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers(),
}))

vi.mock('@/server/modules/accounting/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/server/modules/accounting/service')>()
  return {
    ...actual,
    getAccountingFlags: vi.fn(async () => ({ module: true, studentLedger: false, approvals: true, whatsappReceipts: false, fiscalYearStartMonth: 4 })),
    departmentStageOn: vi.fn(async () => false),
  }
})

import { PrismaClient } from '@prisma/client'
import { tenantDb } from '../src/server/db/tenant-client'
import type { AppContext } from '../src/server/context'

const { createStorePurchase } = await import('../src/server/modules/store/service')
const { actOnJournal } = await import('../src/server/modules/accounting/journal-approval-service')
const { trialBalance, profitAndLoss } = await import('../src/server/modules/accounts/service')
const { cancelPurchaseVoucher, getVendor360, vendorLedgerFrom } = await import('../src/server/modules/accounting/payables-service')
const { schoolToday } = await import('../src/lib/periods')

const prisma = new PrismaClient()
const tag = `T${Date.now().toString(36)}`
let tenantId = ''
let users: string[] = []
const made = { vendorId: '', itemId: '', purchaseId: '', voucherId: '' }

function contextFor(userId: string, held: string[]): AppContext {
  const set = new Set(held)
  return {
    user: {
      sessionId: 's_test', userId, tenantId, isSuperAdmin: false,
      firstName: userId.slice(-4), lastName: 'Tester', email: null, phone: null, avatarUrl: null, displayName: null,
      mustChangePassword: false, roleKeys: ['SCHOOL_ADMIN'], permissions: set, impersonatedById: null,
    },
    tenant: { id: tenantId, name: 'Test School', currency: 'INR' } as never,
    db: tenantDb(tenantId),
    can: (p: string) => set.has(p),
    canAny: (...ps: string[]) => ps.some((p) => set.has(p)),
    require: (p: string) => {
      if (!set.has(p)) throw new Error(`Missing permission: ${p}`)
    },
  }
}

const VIEW = ['accounts.view', 'accounts.manage', 'store.view', 'store.manage']
const maker = () => contextFor(users[0]!, VIEW)
const checker = () => contextFor(users[1]!, [...VIEW, 'expense_approval.validate'])
const accountant = () => contextFor(users[2]!, [...VIEW, 'expense_approval.approve_finance'])
const owner = () => contextFor(users[3]!, [...VIEW, 'expense_approval.approve_final'])

beforeAll(async () => {
  const demo = await prisma.tenant.findFirstOrThrow({ where: { slug: 'demo' }, select: { id: true } })
  tenantId = demo.id
  const found = await prisma.user.findMany({ where: { tenantId }, select: { id: true }, take: 4 })
  if (found.length < 4) throw new Error('Seed the database first')
  users = found.map((u) => u.id)
  made.vendorId = (await prisma.vendor.create({ data: { tenantId, code: `VEN-${tag}`, name: `Approval test vendor ${tag}`, creditDays: 15 } })).id
  made.itemId = (await prisma.storeItem.create({ data: { tenantId, sku: `SKU-${tag}`, name: `Approval test item ${tag}`, sellingPriceMinor: 20_000 } })).id
})

afterAll(async () => {
  const entries = await prisma.journalEntry.findMany({
    where: { tenantId, OR: [{ sourceId: { in: [made.voucherId, made.purchaseId].filter(Boolean) } }] },
    select: { id: true },
  })
  const ids = entries.map((e) => e.id)
  await prisma.journalEntry.updateMany({ where: { id: { in: ids } }, data: { reversalOfId: null } })
  await prisma.journalLine.deleteMany({ where: { entryId: { in: ids } } })
  await prisma.journalEntry.deleteMany({ where: { id: { in: ids } } })
  if (made.voucherId) await prisma.purchaseVoucher.deleteMany({ where: { id: made.voucherId } })
  await prisma.stockMovement.deleteMany({ where: { itemId: made.itemId } })
  if (made.purchaseId) await prisma.storePurchase.deleteMany({ where: { id: made.purchaseId } })
  await prisma.storeItem.deleteMany({ where: { id: made.itemId } })
  await prisma.vendor.deleteMany({ where: { id: made.vendorId } })
  await prisma.ledgerSummaryState.deleteMany({ where: { tenantId } })
  await prisma.$disconnect()
  if (saved.module === undefined) delete process.env.ACCOUNTING_MODULE_ENABLED
  else process.env.ACCOUNTING_MODULE_ENABLED = saved.module
})

describe('stock bought on credit, held for approval', () => {
  const today = schoolToday()
  const range = { from: `${today.slice(0, 4)}-01-01`, to: today }
  let stockId = ''
  let entryId = ''
  let before = { closing: 0, expenseMinor: 0 }

  it('raises the vendor bill with the stock receipt in one step, waiting for the Checker', async () => {
    const stock = await prisma.ledgerAccount.findFirst({ where: { tenantId, systemKey: 'STORE_STOCK' }, select: { id: true } })
    const tb0 = await trialBalance(maker(), range)
    before = { closing: tb0.rows.find((r) => r.id === stock?.id)?.closingMinor ?? 0, expenseMinor: (await profitAndLoss(maker(), range)).expenseMinor }

    const purchase = await createStorePurchase(maker(), {
      vendorName: `Approval test vendor ${tag}`,
      vendorId: made.vendorId,
      invoiceNo: `INV-${tag}`,
      purchaseDate: today,
      paymentMode: 'CREDIT',
      lines: [{ itemId: made.itemId, quantity: 3, unitCost: 100 }],
    })
    made.purchaseId = purchase.id

    const item = await prisma.storeItem.findUniqueOrThrow({ where: { id: made.itemId } })
    expect(item.quantity).toBe(3)

    const voucher = await prisma.purchaseVoucher.findFirstOrThrow({ where: { tenantId, storePurchaseId: purchase.id } })
    made.voucherId = voucher.id
    expect(voucher).toMatchObject({ status: 'POSTED', totalMinor: 30_000, vendorId: made.vendorId })

    const entry = await prisma.journalEntry.findFirstOrThrow({
      where: { tenantId, sourceType: 'PURCHASE_VOUCHER', sourceId: voucher.id },
      include: { lines: { include: { account: { select: { systemKey: true } } } } },
    })
    entryId = entry.id
    stockId = entry.lines.find((l) => l.account.systemKey === 'STORE_STOCK')!.accountId
    expect(entry.approvalStatus).toBe('PENDING_CHECK')
    expect(entry.lines.find((l) => l.account.systemKey === 'STORE_STOCK')?.debitMinor).toBe(30_000)
    expect(entry.lines.find((l) => l.account.systemKey === 'SUNDRY_CREDITORS')?.creditMinor).toBe(30_000)

    await new Promise((r) => setTimeout(r, 800))
    const ownPosting = await prisma.journalEntry.count({ where: { tenantId, sourceType: 'STORE_PURCHASE', sourceId: purchase.id } })
    expect(ownPosting).toBe(0)
  })

  it('shows it in the trial balance pending columns only, not in the closing balance', async () => {
    const tb = await trialBalance(maker(), range)
    const row = tb.rows.find((r) => r.id === stockId)!
    expect(row.closingMinor).toBe(before.closing)
    expect(row.pendingDebitMinor).toBeGreaterThanOrEqual(30_000)
    expect(row.closingWithPendingMinor - row.closingMinor).toBe(row.pendingDebitMinor - row.pendingCreditMinor)
  })

  it('puts the bill on the vendor ledger', async () => {
    const ledger = vendorLedgerFrom(await getVendor360(maker(), made.vendorId))
    expect(ledger.map((r) => [r.voucherType, r.creditMinor])).toEqual([['Purchase', 30_000]])
  })

  it('cannot be cancelled from Bills payable, because the stock already moved', async () => {
    await expect(cancelPurchaseVoucher(maker(), made.voucherId, 'test')).rejects.toMatchObject({ status: 409 })
  })

  it('needs Checker, Accountant and Owner, never the maker, before it counts', async () => {
    await expect(actOnJournal(maker(), entryId, { action: 'approve' })).rejects.toMatchObject({ status: 403 })
    await expect(actOnJournal(accountant(), entryId, { action: 'approve' })).rejects.toMatchObject({ status: 403 })

    expect(await actOnJournal(checker(), entryId, { action: 'approve', expectedStatus: 'PENDING_CHECK' })).toMatchObject({ to: 'PENDING_ACCOUNTANT' })
    expect(await actOnJournal(accountant(), entryId, { action: 'approve' })).toMatchObject({ to: 'PENDING_OWNER' })

    const mid = await trialBalance(maker(), range)
    expect(mid.rows.find((r) => r.id === stockId)!.closingMinor).toBe(before.closing)

    expect(await actOnJournal(owner(), entryId, { action: 'approve' })).toMatchObject({ to: 'APPROVED' })
    const after = await trialBalance(maker(), range)
    expect(after.rows.find((r) => r.id === stockId)!.closingMinor).toBe(before.closing + 30_000)

    const steps = await prisma.journalApprovalStep.findMany({ where: { entryId }, orderBy: { createdAt: 'asc' } })
    expect(steps.map((s) => s.action)).toEqual(['APPROVE_CHECK', 'APPROVE_ACCOUNTANT', 'APPROVE_OWNER'])
  })

  it('does not touch P&L, because stock is an asset', async () => {
    expect((await profitAndLoss(maker(), range)).expenseMinor).toBe(before.expenseMinor)
  })
})
