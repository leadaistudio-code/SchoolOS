import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { tenantDb } from '../src/server/db/tenant-client'
import type { AppContext } from '../src/server/context'
import {
  adjustStock,
  createStoreItem,
  createStorePurchase,
  createStoreSale,
  voidStoreSale,
} from '../src/server/modules/store/service'
import {
  syncStockMovementLedger,
  syncStorePurchaseLedger,
  syncStoreSaleLedger,
} from '../src/server/modules/accounts/posting'

/**
 * The store's promise to a school: stock only moves through recorded
 * movements, a bill can never sell what is not on the shelf (even when two
 * counters bill at once), voiding puts goods back, and the books balance.
 */
const prisma = new PrismaClient()
const TAG = `ZZSTORE-${Date.now().toString(36)}`

let tenantId: string
let studentId: string
let ctx: AppContext
const itemIds: string[] = []

function contextFor(id: string): AppContext {
  const held = new Set(['store.view', 'store.sell', 'store.manage', 'store.void'])
  return {
    user: {
      sessionId: 's_test',
      userId: 'u_test',
      tenantId: id,
      isSuperAdmin: false,
      firstName: 'Store',
      lastName: 'Tester',
      email: null,
      phone: null,
      avatarUrl: null,
      displayName: null,
      mustChangePassword: false,
      roleKeys: ['SCHOOL_ADMIN'],
      permissions: held,
      impersonatedById: null,
    },
    tenant: { id, name: 'Test School', currency: 'INR' } as never,
    db: tenantDb(id),
    can: (p: string) => held.has(p),
    canAny: (...ps: string[]) => ps.some((p) => held.has(p)),
    require: (p: string) => {
      if (!held.has(p)) throw new Error(`missing ${p}`)
    },
  }
}

async function qty(id: string) {
  return (await prisma.storeItem.findUniqueOrThrow({ where: { id } })).quantity
}

async function activeEntry(sourceType: 'STORE_SALE' | 'STORE_PURCHASE' | 'STORE_STOCK', sourceId: string) {
  return prisma.journalEntry.findFirst({
    where: { tenantId, sourceType, sourceId, isReversal: false, reversedAt: null },
    include: { lines: { include: { account: { select: { systemKey: true } } } } },
  })
}

beforeAll(async () => {
  const demo = await prisma.tenant.findUnique({ where: { slug: 'demo' } })
  if (!demo) throw new Error('Seed the database first: npm run db:seed')
  tenantId = demo.id
  studentId = (await prisma.student.findFirstOrThrow({ where: { tenantId, deletedAt: null } })).id
  ctx = contextFor(tenantId)
  await prisma.ledgerSettings.upsert({
    where: { tenantId },
    create: { tenantId, autoPostStore: true },
    update: { autoPostStore: true },
  })
})

afterAll(async () => {
  // Let fire-and-forget ledger hooks finish before removing their sources.
  await new Promise((r) => setTimeout(r, 1500))
  const sales = await prisma.storeSale.findMany({ where: { tenantId, lines: { some: { itemId: { in: itemIds } } } }, select: { id: true } })
  const purchases = await prisma.storePurchase.findMany({ where: { tenantId, lines: { some: { itemId: { in: itemIds } } } }, select: { id: true } })
  const movements = await prisma.stockMovement.findMany({ where: { tenantId, itemId: { in: itemIds } }, select: { id: true } })
  const sourceIds = [...sales, ...purchases, ...movements].map((r) => r.id)
  const entries = await prisma.journalEntry.findMany({ where: { tenantId, sourceId: { in: sourceIds } }, select: { id: true } })
  await prisma.journalLine.deleteMany({ where: { entryId: { in: entries.map((e) => e.id) } } })
  await prisma.journalEntry.updateMany({ where: { id: { in: entries.map((e) => e.id) } }, data: { reversalOfId: null } })
  await prisma.journalEntry.deleteMany({ where: { id: { in: entries.map((e) => e.id) } } })
  await prisma.stockMovement.deleteMany({ where: { tenantId, itemId: { in: itemIds } } })
  await prisma.storeSale.deleteMany({ where: { id: { in: sales.map((s) => s.id) } } })
  await prisma.storePurchase.deleteMany({ where: { id: { in: purchases.map((p) => p.id) } } })
  await prisma.storeItem.deleteMany({ where: { id: { in: itemIds } } })
  await prisma.$disconnect()
})

describe('school store (database)', () => {
  let shirt: string
  let book: string

  it('creates items with opening stock and an opening movement', async () => {
    const a = await createStoreItem(ctx, {
      name: `${TAG} Shirt`,
      category: 'UNIFORM',
      variant: 'Size 32',
      sellingPrice: 525,
      taxPercent: 5,
      reorderLevel: 3,
      openingQuantity: 10,
      openingUnitCost: 400,
    })
    const b = await createStoreItem(ctx, { name: `${TAG} Maths book`, category: 'BOOKS', sellingPrice: 240, openingQuantity: 0 })
    shirt = a.id
    book = b.id
    itemIds.push(a.id, b.id)
    expect(a.sku).toMatch(/^UN-\d{4}$/)
    expect(a.quantity).toBe(10)
    const opening = await prisma.stockMovement.findFirstOrThrow({ where: { itemId: a.id } })
    expect(opening).toMatchObject({ type: 'OPENING', quantity: 10, balanceAfter: 10, unitCostMinor: 40000 })

    await syncStockMovementLedger(tenantId, opening.id)
    const entry = await activeEntry('STORE_STOCK', opening.id)
    expect(entry?.totalMinor).toBe(400000)
  })

  it('receiving stock raises quantity and blends the average cost', async () => {
    const p = await createStorePurchase(ctx, {
      vendorName: `${TAG} Vendor`,
      purchaseDate: new Date().toISOString().slice(0, 10),
      paymentMode: 'BANK_TRANSFER',
      lines: [
        { itemId: shirt, quantity: 30, unitCost: 440 },
        { itemId: book, quantity: 5, unitCost: 180 },
      ],
    })
    expect(p.number).toMatch(/^GRN-/)
    expect(p.totalMinor).toBe(30 * 44000 + 5 * 18000)
    const item = await prisma.storeItem.findUniqueOrThrow({ where: { id: shirt } })
    expect(item.quantity).toBe(40)
    expect(item.avgCostMinor).toBe(43000) // (10×400 + 30×440) / 40

    await syncStorePurchaseLedger(tenantId, p.id)
    const entry = await activeEntry('STORE_PURCHASE', p.id)
    expect(entry?.lines.find((l) => l.account.systemKey === 'STORE_STOCK')?.debitMinor).toBe(p.totalMinor)
  })

  it('a sale reduces stock, books GST and cost, and posts a balanced entry', async () => {
    const sale = await createStoreSale(ctx, {
      studentId,
      paymentMode: 'CASH',
      lines: [
        { itemId: shirt, quantity: 2, discount: 0 },
        { itemId: book, quantity: 1, discount: 40 },
      ],
    })
    expect(sale.number).toMatch(/^STR-/)
    expect(sale.totalMinor).toBe(2 * 52500 + (24000 - 4000))
    expect(sale.taxMinor).toBe(5000)
    expect(sale.costMinor).toBe(2 * 43000 + 18000)
    expect(await qty(shirt)).toBe(38)
    expect(await qty(book)).toBe(4)

    await syncStoreSaleLedger(tenantId, sale.id)
    const entry = await activeEntry('STORE_SALE', sale.id)
    expect(entry).not.toBeNull()
    const dr = entry!.lines.reduce((s, l) => s + l.debitMinor, 0)
    const cr = entry!.lines.reduce((s, l) => s + l.creditMinor, 0)
    expect(dr).toBe(cr)
    const by = (k: string) => entry!.lines.find((l) => l.account.systemKey === k)
    expect(by('GST_PAYABLE')?.creditMinor).toBe(5000)
    expect(by('STORE_SALES_INCOME')?.creditMinor).toBe(sale.totalMinor - 5000)
    expect(by('EXP_STORE_COGS')?.debitMinor).toBe(sale.costMinor)
  })

  it('refuses to sell more than is on the shelf', async () => {
    await expect(
      createStoreSale(ctx, { customerName: 'Walk-in', paymentMode: 'CASH', lines: [{ itemId: book, quantity: 5 }] }),
    ).rejects.toThrow(/Only 4/)
    expect(await qty(book)).toBe(4)
  })

  it('two counters billing the last units at once cannot oversell', async () => {
    const results = await Promise.allSettled(
      [0, 1, 2].map(() =>
        createStoreSale(ctx, { customerName: 'Rush', paymentMode: 'UPI', lines: [{ itemId: book, quantity: 2 }] }),
      ),
    )
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2)
    expect(await qty(book)).toBe(0)
    const ledger = await prisma.stockMovement.aggregate({ where: { itemId: book }, _sum: { quantity: true } })
    expect(ledger._sum.quantity).toBe(0)
  })

  it('voiding a bill returns the goods and reverses the entry', async () => {
    const sale = await createStoreSale(ctx, { customerName: 'Parent', paymentMode: 'CASH', lines: [{ itemId: shirt, quantity: 3 }] })
    await syncStoreSaleLedger(tenantId, sale.id)
    expect(await qty(shirt)).toBe(35)
    await voidStoreSale(ctx, sale.id, 'Wrong size')
    expect(await qty(shirt)).toBe(38)
    await expect(voidStoreSale(ctx, sale.id, 'again')).rejects.toThrow(/already voided/)
    await syncStoreSaleLedger(tenantId, sale.id)
    // voidStoreSale also posts in the background; when the two race, the loser
    // hits the posting-key guard and returns before the winner has committed.
    await expect.poll(() => activeEntry('STORE_SALE', sale.id), { timeout: 5000 }).toBeNull()
  })

  it('adjustments need a reason, cannot go below zero, and keep quantity equal to the movement ledger', async () => {
    await expect(adjustStock(ctx, { itemId: shirt, direction: 'OUT', quantity: 500, reason: 'Damaged' })).rejects.toThrow(/Only 38/)
    const m = await adjustStock(ctx, { itemId: shirt, direction: 'OUT', quantity: 2, reason: 'Damaged' })
    expect(m).toMatchObject({ type: 'ADJUSTMENT_OUT', quantity: -2, balanceAfter: 36 })
    await syncStockMovementLedger(tenantId, m.id)
    const entry = await activeEntry('STORE_STOCK', m.id)
    expect(entry?.lines.find((l) => l.account.systemKey === 'EXP_STOCK_LOSS')?.debitMinor).toBe(2 * 43000)

    const ledger = await prisma.stockMovement.aggregate({ where: { itemId: shirt }, _sum: { quantity: true } })
    expect(ledger._sum.quantity).toBe(await qty(shirt))
  })
})
