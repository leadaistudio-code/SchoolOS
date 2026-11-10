import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { badRequest, conflict, notFound } from '@/server/api/response'
import { uploadFile } from '@/server/files'
import { storageProvider } from '@/server/providers'
import { attendanceDate, toDateInput } from '@/lib/dates'
import { financialYearRange, presetRange, schoolToday } from '@/lib/periods'
import { orderByFrom, skipTake, type ListQuery } from '@/lib/query'
import {
  EXPENSE_CATEGORIES,
  EXPENSE_PAYMENT_MODES,
  categoryLabel,
  paymentModeLabel,
} from '@/lib/finance/expense-options'
import { ensureExpenseHeads } from './expense-heads'
import { financialYearLabel, nextDocumentNumber } from '@/server/numbering'
import { cashBankAccounts } from '@/server/modules/accounting/cash-bank'
import { getAccountingFlags } from '@/server/modules/accounting/service'

export { EXPENSE_CATEGORIES, EXPENSE_PAYMENT_MODES, categoryLabel, paymentModeLabel }

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date')

const rupees = z.coerce
  .number()
  .min(0.01, 'Enter an amount greater than zero')
  .max(10_000_000, 'That amount looks wrong')
  .transform((v) => Math.round(v * 100))

const categoryEnum = z.enum([
  'SALARY',
  'UTILITIES',
  'MAINTENANCE',
  'SUPPLIES',
  'TRANSPORT',
  'FOOD',
  'EVENTS',
  'ADMIN',
  'ACADEMIC',
  'OTHER',
])

const paymentModeEnum = z.enum(['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'OTHER'])

export const expenseSchema = z.object({
  title: z.string().trim().min(2, 'Describe the expense').max(120),
  headId: z.string().min(1, 'Choose an expense head'),
  amount: rupees,
  expenseDate: isoDate,
  paymentMode: paymentModeEnum.default('CASH'),
  vendor: z.string().trim().max(120).optional(),
  referenceNo: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(500).optional(),
  /** Who made the expense; blank means the person recording it. */
  spentBy: z.string().trim().max(120).optional(),
  /** Optional: a retried submission with the same key returns the first expense. */
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
  /** Optional cash / bank ledger; otherwise the account mapped to the payment mode. */
  cashAccountId: z.string().min(1).optional(),
})

export const expenseUpdateSchema = expenseSchema.omit({ idempotencyKey: true }).extend({
  id: z.string().min(1),
})

const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional()).catch(undefined)

export const expenseFilterSchema = z.object({
  q: z.string().optional(),
  category: optional(categoryEnum),
  headId: optional(z.string()),
  nature: optional(z.enum(['DIRECT', 'INDIRECT'])),
  paymentMode: optional(paymentModeEnum),
  recordedById: optional(z.string()),
  preset: optional(z.string()),
  from: optional(isoDate),
  to: optional(isoDate),
  /** Recorded expenses, payments made to vendors, or both. */
  source: optional(z.enum(['expenses', 'vendors'])),
})

export type ExpenseFilter = z.infer<typeof expenseFilterSchema>

/** Staff who have recorded at least one live expense, for the "Recorded by" filter. */
export async function expenseRecorderOptions(ctx: AppContext) {
  ctx.require('expenses.view')
  const grouped = await ctx.db.schoolExpense.groupBy({
    by: ['recordedById', 'recordedByLabel'],
    where: { deletedAt: null, recordedById: { not: null } },
  })
  const byId = new Map<string, string>()
  for (const g of grouped) {
    if (g.recordedById && !byId.has(g.recordedById)) byId.set(g.recordedById, g.recordedByLabel ?? 'Staff')
  }
  return [...byId.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export const EXPENSE_SORT_FIELDS = ['expenseDate', 'amountMinor', 'createdAt', 'title'] as const

function filterRange(filter: ExpenseFilter) {
  const range = filter.preset ? presetRange(filter.preset) : null
  return { from: filter.from ?? range?.from, to: filter.to ?? range?.to }
}

/** Vendor payments carry no expense head, so a head or type filter leaves them out. */
function includesVendorPayments(filter: ExpenseFilter) {
  return filter.source !== 'expenses' && !filter.headId && !filter.category && !filter.nature
}

function vendorPaymentWhere(filter: ExpenseFilter): Prisma.VendorPaymentWhereInput {
  const { from, to } = filterRange(filter)
  return {
    status: 'POSTED',
    ...(filter.paymentMode ? { mode: filter.paymentMode } : {}),
    ...(filter.recordedById ? { createdById: filter.recordedById } : {}),
    ...(from || to
      ? {
          paidOn: {
            ...(from ? { gte: attendanceDate(from) } : {}),
            ...(to ? { lte: attendanceDate(to) } : {}),
          },
        }
      : {}),
    ...(filter.q
      ? {
          OR: [
            { number: { contains: filter.q, mode: 'insensitive' as const } },
            { reference: { contains: filter.q, mode: 'insensitive' as const } },
            { narration: { contains: filter.q, mode: 'insensitive' as const } },
            { vendor: { name: { contains: filter.q, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  }
}

const vendorPaymentSelect = {
  id: true,
  number: true,
  vendorId: true,
  paidOn: true,
  mode: true,
  reference: true,
  narration: true,
  amountMinor: true,
  createdAt: true,
  createdByLabel: true,
  vendor: { select: { name: true } },
} satisfies Prisma.VendorPaymentSelect

function expenseWhere(filter: ExpenseFilter): Prisma.SchoolExpenseWhereInput {
  const { from, to } = filterRange(filter)
  return {
    ...(filter.source === 'vendors' ? { id: { in: [] } } : {}),
    deletedAt: null,
    ...(filter.category ? { category: filter.category } : {}),
    ...(filter.headId ? { headId: filter.headId } : {}),
    ...(filter.nature ? { nature: filter.nature } : {}),
    ...(filter.paymentMode ? { paymentMode: filter.paymentMode } : {}),
    ...(filter.recordedById ? { recordedById: filter.recordedById } : {}),
    ...(from || to
      ? {
          expenseDate: {
            ...(from ? { gte: attendanceDate(from) } : {}),
            ...(to ? { lte: attendanceDate(to) } : {}),
          },
        }
      : {}),
    ...(filter.q
      ? {
          OR: [
            { title: { contains: filter.q, mode: 'insensitive' as const } },
            { vendor: { contains: filter.q, mode: 'insensitive' as const } },
            { referenceNo: { contains: filter.q, mode: 'insensitive' as const } },
            { notes: { contains: filter.q, mode: 'insensitive' as const } },
            { spentBy: { contains: filter.q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }
}

export async function listExpenses(ctx: AppContext, query: ListQuery, filter: ExpenseFilter) {
  ctx.require('expenses.view')
  await ensureExpenseHeads(ctx)
  const where = expenseWhere(filter)
  const vendorWhere = includesVendorPayments(filter) ? vendorPaymentWhere(filter) : null
  const [vendorCount, vendorAgg] = vendorWhere
    ? await Promise.all([
        ctx.db.vendorPayment.count({ where: vendorWhere }),
        ctx.db.vendorPayment.aggregate({ where: vendorWhere, _sum: { amountMinor: true } }),
      ])
    : [0, null]

  const orderBy = orderByFrom(query.sort, query.dir, EXPENSE_SORT_FIELDS, { expenseDate: 'desc' })
  // With vendor payments in the mix, both lists are read up to the end of the
  // requested page and merged, so paging stays in one consistent order.
  const { skip, take } = skipTake(query)
  const paging = vendorCount > 0 ? { skip: 0, take: skip + take } : { skip, take }

  const [rows, total, agg, byCategory, byNature, vendorRows] = await Promise.all([
    ctx.db.schoolExpense.findMany({
      where,
      ...paging,
      orderBy,
      include: { head: { select: { id: true, name: true } } },
    }),
    ctx.db.schoolExpense.count({ where }),
    ctx.db.schoolExpense.aggregate({ where, _sum: { amountMinor: true } }),
    ctx.db.schoolExpense.groupBy({
      by: ['category'],
      where,
      _sum: { amountMinor: true },
      _count: { _all: true },
      orderBy: { _sum: { amountMinor: 'desc' } },
    }),
    ctx.db.schoolExpense.groupBy({ by: ['nature'], where, _sum: { amountMinor: true } }),
    vendorWhere && vendorCount > 0
      ? ctx.db.vendorPayment.findMany({ where: vendorWhere, take: skip + take, select: vendorPaymentSelect, orderBy: { paidOn: 'desc' } })
      : Promise.resolve([]),
  ])

  const natureSum = (n: 'DIRECT' | 'INDIRECT') => byNature.find((r) => r.nature === n)?._sum.amountMinor ?? 0
  const expenseItems = rows.map((r) => ({
    kind: 'expense' as const,
    row: { ...r, headName: r.head?.name ?? categoryLabel(r.category), expenseDateInput: toDateInput(r.expenseDate) },
    date: r.expenseDate,
    amountMinor: r.amountMinor,
    createdAt: r.createdAt,
    title: r.title,
  }))
  const vendorItems = vendorRows.map((v) => ({
    kind: 'vendor' as const,
    row: v,
    date: v.paidOn,
    amountMinor: v.amountMinor,
    createdAt: v.createdAt,
    title: `Payment to ${v.vendor.name}`,
  }))
  const sortKey = query.sort && (EXPENSE_SORT_FIELDS as readonly string[]).includes(query.sort) ? query.sort : 'expenseDate'
  const sign = sortKey === query.sort && query.dir === 'asc' ? 1 : -1
  const keyOf = (i: (typeof expenseItems)[number] | (typeof vendorItems)[number]): number | string =>
    sortKey === 'amountMinor' ? i.amountMinor
    : sortKey === 'createdAt' ? i.createdAt.getTime()
    : sortKey === 'title' ? i.title.toLowerCase()
    : i.date.getTime()
  const items =
    vendorCount > 0
      ? [...expenseItems, ...vendorItems]
          .sort((a, b) => {
            const ka = keyOf(a)
            const kb = keyOf(b)
            if (ka < kb) return -sign
            if (ka > kb) return sign
            return b.createdAt.getTime() - a.createdAt.getTime()
          })
          .slice(skip, skip + take)
      : expenseItems

  const vendorMinor = vendorAgg?._sum.amountMinor ?? 0
  return {
    rows: expenseItems.map((i) => i.row),
    items,
    total: total + vendorCount,
    expenseMinor: agg._sum.amountMinor ?? 0,
    vendorMinor,
    vendorCount,
    totalMinor: (agg._sum.amountMinor ?? 0) + vendorMinor,
    directMinor: natureSum('DIRECT'),
    indirectMinor: natureSum('INDIRECT'),
    byCategory: byCategory.map((c) => ({
      category: c.category,
      count: c._count._all,
      amountMinor: c._sum.amountMinor ?? 0,
    })),
  }
}

/** Financial-year picture for the expense dashboard: month-wise and by head. */
export async function expenseOverview(ctx: AppContext, fyStart?: number) {
  ctx.require('expenses.view')
  await ensureExpenseHeads(ctx)
  const start = fyStart ?? Number(financialYearRange(schoolToday()).from.slice(0, 4))
  const from = attendanceDate(`${start}-04-01`)
  const to = attendanceDate(`${start + 1}-03-31`)

  const [monthly, byHead] = await Promise.all([
    ctx.db.$queryRaw<{ month: string; nature: string; total: bigint | number | null; n: bigint | number }[]>`
      SELECT to_char("expenseDate", 'YYYY-MM') AS month, "nature"::text AS nature,
             SUM("amountMinor") AS total, COUNT(*) AS n
      FROM "SchoolExpense"
      WHERE "tenantId" = ${ctx.tenant.id}
        AND "deletedAt" IS NULL
        AND "expenseDate" >= ${from}
        AND "expenseDate" <= ${to}
      GROUP BY 1, 2`,
    ctx.db.schoolExpense.groupBy({
      by: ['headId', 'nature'],
      where: { deletedAt: null, expenseDate: { gte: from, lte: to } },
      _sum: { amountMinor: true },
      orderBy: { _sum: { amountMinor: 'desc' } },
    }),
  ])

  const heads = await ctx.db.expenseHead.findMany({
    where: { id: { in: byHead.map((h) => h.headId).filter((v): v is string => !!v) } },
    select: { id: true, name: true },
  })
  const headName = new Map(heads.map((h) => [h.id, h.name]))

  const months = Array.from({ length: 12 }, (_, i) => {
    const m = ((i + 3) % 12) + 1
    const y = m >= 4 ? start : start + 1
    const key = `${y}-${String(m).padStart(2, '0')}`
    const pick = (n: string) => Number(monthly.find((r) => r.month === key && r.nature === n)?.total ?? 0)
    return {
      key,
      label: new Date(`${key}-01T00:00:00Z`).toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' }),
      directMinor: pick('DIRECT'),
      indirectMinor: pick('INDIRECT'),
    }
  })
  const directMinor = months.reduce((t, m) => t + m.directMinor, 0)
  const indirectMinor = months.reduce((t, m) => t + m.indirectMinor, 0)
  const entries = monthly.reduce((t, r) => t + Number(r.n), 0)

  return {
    fyStart: start,
    fyLabel: `${start}-${String(start + 1).slice(2)}`,
    months,
    directMinor,
    indirectMinor,
    totalMinor: directMinor + indirectMinor,
    entries,
    byHead: byHead.map((h) => ({
      headId: h.headId,
      name: (h.headId && headName.get(h.headId)) || 'Unassigned',
      nature: h.nature,
      amountMinor: h._sum.amountMinor ?? 0,
    })),
  }
}

async function headFor(ctx: AppContext, headId: string) {
  const head = await ctx.db.expenseHead.findFirst({ where: { id: headId } })
  if (!head) throw notFound('Expense head')
  return head
}

async function checkCashAccount(ctx: AppContext, cashAccountId: string | undefined) {
  if (!cashAccountId) return null
  const account = (await cashBankAccounts(ctx.db)).find((a) => a.id === cashAccountId)
  if (!account || !account.isActive) throw badRequest('Choose an active cash or bank ledger')
  return account.id
}

export async function createExpense(ctx: AppContext, input: z.infer<typeof expenseSchema>) {
  ctx.require('expenses.manage')
  const replay = input.idempotencyKey
    ? await ctx.db.schoolExpense.findFirst({ where: { idempotencyKey: input.idempotencyKey } })
    : null
  if (replay) return replay
  if ((await getAccountingFlags(ctx.db)).approvals) {
    throw conflict('Expense approval is switched on: submit this expense for approval instead')
  }
  const head = await headFor(ctx, input.headId)
  if (!head.isActive) throw badRequest(`${head.name} is switched off; choose another head`)
  const cashAccountId = await checkCashAccount(ctx, input.cashAccountId)
  const expenseDate = attendanceDate(input.expenseDate)

  let created
  try {
    created = await ctx.db.$transaction(async (tx) => {
      const voucherNumber = await nextDocumentNumber(tx, {
        tenantId: ctx.tenant.id,
        kind: 'EXPENSE_VOUCHER',
        sessionLabel: financialYearLabel(expenseDate),
      })
      return tx.schoolExpense.create({
        data: {
          tenantId: ctx.tenant.id,
          title: input.title,
          headId: head.id,
          category: head.category,
          nature: head.nature,
          amountMinor: input.amount,
          expenseDate,
          paymentMode: input.paymentMode,
          vendor: input.vendor || null,
          referenceNo: input.referenceNo || null,
          notes: input.notes || null,
          recordedById: ctx.user.userId,
          recordedByLabel: `${ctx.user.firstName} ${ctx.user.lastName}`.trim(),
          spentBy: input.spentBy || `${ctx.user.firstName} ${ctx.user.lastName}`.trim(),
          voucherNumber,
          idempotencyKey: input.idempotencyKey ?? null,
          cashAccountId,
        },
      })
    })
  } catch (err) {
    if (input.idempotencyKey && (err as { code?: string })?.code === 'P2002') {
      const winner = await ctx.db.schoolExpense.findFirst({ where: { idempotencyKey: input.idempotencyKey } })
      if (winner) return winner
    }
    throw err
  }

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'expense.create',
    module: 'expenses',
    entityType: 'SchoolExpense',
    entityId: created.id,
    summary: `Recorded ${head.nature.toLowerCase()} expense ${created.title} (${head.name}) for ₹${created.amountMinor / 100}`,
    after: created,
  })
  postExpense(ctx.tenant.id, created.id)

  return created
}

/** Expenses that went through approval are corrected only by reversing them from their request. */
async function assertNotFromApproval(ctx: AppContext, expenseId: string) {
  const request = await ctx.db.expenseApprovalRequest.findFirst({ where: { expenseId }, select: { number: true } })
  if (request) throw conflict(`This expense was approved through ${request.number}; reverse it there instead of editing it`)
}

function postExpense(tenantId: string, expenseId: string) {
  void import('@/server/modules/accounts/posting')
    .then(({ syncExpenseLedger }) => syncExpenseLedger(tenantId, expenseId))
    .catch((err) => console.error('[ledger] expense hook failed', err))
}

export async function updateExpense(ctx: AppContext, input: z.infer<typeof expenseUpdateSchema>) {
  ctx.require('expenses.manage')
  const { id, ...data } = input

  const before = await ctx.db.schoolExpense.findFirst({ where: { id, deletedAt: null } })
  if (!before) throw notFound('Expense')
  await assertNotFromApproval(ctx, id)
  const head = await headFor(ctx, data.headId)
  if (!head.isActive && head.id !== before.headId) {
    throw badRequest(`${head.name} is switched off; choose another head`)
  }
  // A ledger chosen for the old payment mode would be wrong for a new one.
  const cashAccountId = data.cashAccountId
    ? await checkCashAccount(ctx, data.cashAccountId)
    : data.paymentMode === before.paymentMode ? before.cashAccountId : null

  const updated = await ctx.db.schoolExpense.update({
    where: { id },
    data: {
      title: data.title,
      headId: head.id,
      category: head.category,
      nature: head.nature,
      amountMinor: data.amount,
      expenseDate: attendanceDate(data.expenseDate),
      paymentMode: data.paymentMode,
      vendor: data.vendor || null,
      referenceNo: data.referenceNo || null,
      notes: data.notes || null,
      spentBy: data.spentBy || before.spentBy,
      cashAccountId,
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'expense.update',
    module: 'expenses',
    entityType: 'SchoolExpense',
    entityId: id,
    summary: `Updated expense ${updated.title}`,
    before,
    after: updated,
  })
  postExpense(ctx.tenant.id, id)

  return updated
}

export async function deleteExpense(ctx: AppContext, id: string) {
  ctx.require('expenses.manage')

  const before = await ctx.db.schoolExpense.findFirst({ where: { id, deletedAt: null } })
  if (!before) throw notFound('Expense')
  await assertNotFromApproval(ctx, id)

  const archived = await ctx.db.schoolExpense.update({
    where: { id },
    data: { deletedAt: new Date() },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'expense.delete',
    module: 'expenses',
    entityType: 'SchoolExpense',
    entityId: id,
    summary: `Removed expense ${before.title} (₹${before.amountMinor / 100})`,
    before,
  })
  postExpense(ctx.tenant.id, id)

  return archived
}

/* --------------------------------------------------------------- receipts */

const RECEIPT_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])

/** Stores a bill / receipt scan against an expense, replacing any earlier one. */
export async function attachExpenseReceipt(ctx: AppContext, id: string, file: File) {
  ctx.require('expenses.manage')
  const expense = await ctx.db.schoolExpense.findFirst({ where: { id, deletedAt: null } })
  if (!expense) throw notFound('Expense')
  if (!RECEIPT_TYPES.has(file.type)) throw badRequest('Attach a PDF or an image (JPG, PNG, WebP)')

  const stored = await uploadFile(ctx, file, 'expense-receipts')
  await ctx.db.schoolExpense.update({
    where: { id },
    data: { receiptKey: stored.storageKey, receiptName: stored.fileName, receiptMime: stored.mimeType },
  })
  if (expense.receiptKey) await storageProvider().delete(expense.receiptKey).catch(() => undefined)

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'expense.receipt_attach',
    module: 'expenses',
    entityType: 'SchoolExpense',
    entityId: id,
    summary: `Attached ${stored.fileName} to expense ${expense.title}`,
  })
  return { url: `/api/v1/files/${encodeURIComponent(stored.storageKey)}`, fileName: stored.fileName }
}

export async function removeExpenseReceipt(ctx: AppContext, id: string) {
  ctx.require('expenses.manage')
  const expense = await ctx.db.schoolExpense.findFirst({ where: { id, deletedAt: null } })
  if (!expense) throw notFound('Expense')
  if (!expense.receiptKey) return
  await ctx.db.schoolExpense.update({
    where: { id },
    data: { receiptKey: null, receiptName: null, receiptMime: null },
  })
  await storageProvider().delete(expense.receiptKey).catch(() => undefined)
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'expense.receipt_remove',
    module: 'expenses',
    entityType: 'SchoolExpense',
    entityId: id,
    summary: `Removed the receipt from expense ${expense.title}`,
  })
}

/* ----------------------------------------------------------------- export */

export async function exportExpenses(ctx: AppContext, filter: ExpenseFilter) {
  ctx.require('expenses.view')
  await ensureExpenseHeads(ctx)
  const [expenses, vendorPayments] = await Promise.all([
    ctx.db.schoolExpense.findMany({
      where: expenseWhere(filter),
      orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
      take: 20000,
      include: { head: { select: { name: true } } },
    }),
    includesVendorPayments(filter)
      ? ctx.db.vendorPayment.findMany({
          where: vendorPaymentWhere(filter),
          orderBy: [{ paidOn: 'desc' }, { createdAt: 'desc' }],
          take: 20000,
          select: vendorPaymentSelect,
        })
      : Promise.resolve([]),
  ])
  return { expenses, vendorPayments }
}
