import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { notFound } from '@/server/api/response'
import { attendanceDate, toDateInput } from '@/lib/dates'
import { orderByFrom, skipTake, type ListQuery } from '@/lib/query'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date')

const rupees = z.coerce
  .number()
  .min(0.01, 'Enter an amount greater than zero')
  .max(10_000_000, 'That amount looks wrong')
  .transform((v) => Math.round(v * 100))

export const EXPENSE_CATEGORIES = [
  { value: 'SALARY', label: 'Salary & wages' },
  { value: 'UTILITIES', label: 'Utilities (power, water, internet)' },
  { value: 'MAINTENANCE', label: 'Maintenance & repairs' },
  { value: 'SUPPLIES', label: 'Supplies & stationery' },
  { value: 'TRANSPORT', label: 'Transport & fuel' },
  { value: 'FOOD', label: 'Food & canteen' },
  { value: 'EVENTS', label: 'Events & functions' },
  { value: 'ADMIN', label: 'Admin & office' },
  { value: 'ACADEMIC', label: 'Academic materials' },
  { value: 'OTHER', label: 'Other' },
] as const

export const EXPENSE_PAYMENT_MODES = [
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'CARD', label: 'Card' },
  { value: 'OTHER', label: 'Other' },
] as const

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
  category: categoryEnum.default('OTHER'),
  amount: rupees,
  expenseDate: isoDate,
  paymentMode: paymentModeEnum.default('CASH'),
  vendor: z.string().trim().max(120).optional(),
  referenceNo: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(500).optional(),
})

export const expenseUpdateSchema = expenseSchema.extend({
  id: z.string().min(1),
})

export const expenseFilterSchema = z.object({
  q: z.string().optional(),
  category: categoryEnum.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
})

export const EXPENSE_SORT_FIELDS = ['expenseDate', 'amountMinor', 'createdAt', 'title'] as const

export async function listExpenses(
  ctx: AppContext,
  query: ListQuery,
  filter: z.infer<typeof expenseFilterSchema>,
) {
  ctx.require('expenses.view')

  const where = {
    deletedAt: null,
    ...(filter.category ? { category: filter.category } : {}),
    ...(filter.from || filter.to
      ? {
          expenseDate: {
            ...(filter.from ? { gte: attendanceDate(filter.from) } : {}),
            ...(filter.to ? { lte: attendanceDate(filter.to) } : {}),
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
          ],
        }
      : {}),
  }

  const [rows, total, agg, byCategory] = await Promise.all([
    ctx.db.schoolExpense.findMany({
      where,
      ...skipTake(query),
      orderBy: orderByFrom(query.sort, query.dir, EXPENSE_SORT_FIELDS, { expenseDate: 'desc' }),
    }),
    ctx.db.schoolExpense.count({ where }),
    ctx.db.schoolExpense.aggregate({
      where,
      _sum: { amountMinor: true },
    }),
    ctx.db.schoolExpense.groupBy({
      by: ['category'],
      where,
      _sum: { amountMinor: true },
      _count: { _all: true },
      orderBy: { _sum: { amountMinor: 'desc' } },
    }),
  ])

  return {
    rows: rows.map((r) => ({
      ...r,
      expenseDateInput: toDateInput(r.expenseDate),
    })),
    total,
    totalMinor: agg._sum.amountMinor ?? 0,
    byCategory: byCategory.map((c) => ({
      category: c.category,
      count: c._count._all,
      amountMinor: c._sum.amountMinor ?? 0,
    })),
  }
}

export async function createExpense(ctx: AppContext, input: z.infer<typeof expenseSchema>) {
  ctx.require('expenses.manage')

  const created = await ctx.db.schoolExpense.create({
    data: {
      tenantId: ctx.tenant.id,
      title: input.title,
      category: input.category,
      amountMinor: input.amount,
      expenseDate: attendanceDate(input.expenseDate),
      paymentMode: input.paymentMode,
      vendor: input.vendor || null,
      referenceNo: input.referenceNo || null,
      notes: input.notes || null,
      recordedById: ctx.user.userId,
      recordedByLabel: `${ctx.user.firstName} ${ctx.user.lastName}`.trim(),
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'expense.create',
    module: 'expenses',
    entityType: 'SchoolExpense',
    entityId: created.id,
    summary: `Recorded expense ${created.title} for ₹${created.amountMinor / 100}`,
    after: created,
  })

  return created
}

export async function updateExpense(ctx: AppContext, input: z.infer<typeof expenseUpdateSchema>) {
  ctx.require('expenses.manage')
  const { id, ...data } = input

  const before = await ctx.db.schoolExpense.findFirst({ where: { id, deletedAt: null } })
  if (!before) throw notFound('Expense')

  const updated = await ctx.db.schoolExpense.update({
    where: { id },
    data: {
      title: data.title,
      category: data.category,
      amountMinor: data.amount,
      expenseDate: attendanceDate(data.expenseDate),
      paymentMode: data.paymentMode,
      vendor: data.vendor || null,
      referenceNo: data.referenceNo || null,
      notes: data.notes || null,
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

  return updated
}

export async function deleteExpense(ctx: AppContext, id: string) {
  ctx.require('expenses.manage')

  const before = await ctx.db.schoolExpense.findFirst({ where: { id, deletedAt: null } })
  if (!before) throw notFound('Expense')

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

  return archived
}

export function categoryLabel(value: string) {
  return EXPENSE_CATEGORIES.find((c) => c.value === value)?.label ?? value
}

export function paymentModeLabel(value: string) {
  return EXPENSE_PAYMENT_MODES.find((m) => m.value === value)?.label ?? value
}
