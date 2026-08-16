import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { tenantDb } from '../src/server/db/tenant-client'
import { collectSchema, listPayments } from '../src/server/modules/finance/payments'
import type { AppContext } from '../src/server/context'

/**
 * The bill book number: the serial a cashier writes on the school's paper
 * receipt when they also issue one from the counter.
 *
 * It is deliberately unvalidated — schools run two counters from two books
 * whose numbers repeat, and a cashier with a queue must never be blocked by
 * this field. So what is worth testing is not rejection but the opposite: that
 * a duplicate is allowed through, and that a number written on a paper slip
 * can be used to find the payment it belongs to.
 */
const prisma = new PrismaClient()

let tenantId: string
let studentId: string
let ctx: AppContext

const BOOK_NO = 'ZZTEST-BB-4417'

function contextFor(id: string): AppContext {
  const held = new Set(['fees.view', 'fees.collect'])
  return {
    user: {
      sessionId: 's_test',
      userId: 'u_test',
      tenantId: id,
      isSuperAdmin: false,
      firstName: 'Test',
      lastName: 'Cashier',
      email: null,
      phone: null,
      avatarUrl: null,
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

beforeAll(async () => {
  const demo = await prisma.tenant.findUnique({ where: { slug: 'demo' } })
  if (!demo) throw new Error('Seed the database first: npm run db:seed')
  tenantId = demo.id

  const student = await prisma.student.findFirstOrThrow({
    where: { tenantId, deletedAt: null },
  })
  studentId = student.id

  ctx = contextFor(tenantId)
})

afterAll(async () => {
  await prisma.feePayment.deleteMany({ where: { tenantId, billBookNo: BOOK_NO } })
  await prisma.$disconnect()
})

async function recordPayment(billBookNo: string | null, amountMinor = 50_000) {
  return prisma.feePayment.create({
    data: {
      tenantId,
      studentId,
      amountMinor,
      currency: 'INR',
      mode: 'CASH',
      status: 'SUCCESS',
      provider: 'manual',
      billBookNo,
      paidAt: new Date(),
    },
  })
}

describe('the collect contract', () => {
  const base = { studentId: 'st_1', amount: 500, mode: 'CASH' as const }

  it('accepts a payment without a bill book number', () => {
    expect(collectSchema.parse(base).billBookNo).toBeUndefined()
  })

  it('keeps the number as typed, trimming only stray spaces', () => {
    expect(collectSchema.parse({ ...base, billBookNo: '  1041  ' }).billBookNo).toBe('1041')
  })

  it('accepts a book number that is not a plain integer', () => {
    // Two counters, two books: A-101 and B-101 are different receipts.
    expect(collectSchema.parse({ ...base, billBookNo: 'A-101' }).billBookNo).toBe('A-101')
  })

  it('refuses only an absurdly long value', () => {
    expect(() => collectSchema.parse({ ...base, billBookNo: 'x'.repeat(41) })).toThrow()
  })
})

describe('recording and finding a bill book number', () => {
  it('stores the number against the payment', async () => {
    const payment = await recordPayment(BOOK_NO)
    const stored = await prisma.feePayment.findUniqueOrThrow({ where: { id: payment.id } })

    expect(stored.billBookNo).toBe(BOOK_NO)
  })

  it('allows the same number twice rather than blocking the counter', async () => {
    await recordPayment(BOOK_NO)
    await recordPayment(BOOK_NO)

    const rows = await prisma.feePayment.findMany({ where: { tenantId, billBookNo: BOOK_NO } })
    expect(rows.length).toBeGreaterThanOrEqual(2)
  })

  it('finds the payment from the number on the paper slip', async () => {
    await recordPayment(BOOK_NO)

    const { rows } = await listPayments(
      ctx,
      { page: 1, pageSize: 25, q: BOOK_NO },
      { status: undefined, mode: undefined, from: undefined, to: undefined } as never,
    )

    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => r.billBookNo === BOOK_NO)).toBe(true)
  })

  it('matches case-insensitively, since a book is written by hand', async () => {
    await recordPayment(BOOK_NO)

    const { rows } = await listPayments(
      ctx,
      { page: 1, pageSize: 25, q: BOOK_NO.toLowerCase() },
      { status: undefined, mode: undefined, from: undefined, to: undefined } as never,
    )

    expect(rows.length).toBeGreaterThan(0)
  })

  it('leaves the field null when no paper receipt was issued', async () => {
    const payment = await recordPayment(null)
    try {
      const stored = await prisma.feePayment.findUniqueOrThrow({ where: { id: payment.id } })
      expect(stored.billBookNo).toBeNull()
    } finally {
      await prisma.feePayment.delete({ where: { id: payment.id } })
    }
  })
})
