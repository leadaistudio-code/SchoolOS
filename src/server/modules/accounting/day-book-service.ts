import { JournalSourceType, type Prisma } from '@prisma/client'
import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { ApiException, badRequest } from '@/server/api/response'
import { attendanceDate } from '@/lib/dates'
import { schoolToday } from '@/lib/periods'
import { createExpense, expenseSchema } from '@/server/modules/finance/expenses'
import { syncExpenseLedger } from '@/server/modules/accounts/posting'
import { assertPostingAllowed, getAccountingFlags, recordAccountingEvent } from './service'
import { isIsoDate, toIsoDay } from './fiscal-year'
import { cashBankAccounts } from './cash-bank'
import { createExpenseRequest } from './expense-approval-service'
import {
  buildDayBookRow,
  checkExpensePostings,
  dayBookTotals,
  filterRows,
  movementByAccount,
  reconcileCashBank,
  summariseDays,
  summariseHeads,
  type DayBookDirection,
  type DayBookEntry,
  type DayBookRow,
} from './day-book'

/** Above this the register asks for a narrower range instead of loading everything. */
export const DAY_BOOK_ROW_LIMIT = 3000
const PAGE_SIZE = 100
const REPAIR_LIMIT = 200

async function requireDayBook(ctx: AppContext, permission: 'accounts.view' | 'accounts.manage' | 'expenses.manage') {
  ctx.require(permission)
  const flags = await getAccountingFlags(ctx.db)
  if (!flags.module) throw new ApiException(403, 'FEATURE_DISABLED', 'The Day Book is not enabled for this school')
  return flags
}

const optionalText = z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), z.string().trim().max(120).optional())
const optionalDate = z.preprocess((v) => (v === '' ? undefined : v), z.string().refine(isIsoDate, 'Use a YYYY-MM-DD date').optional()).catch(undefined)

export const dayBookFilterSchema = z.object({
  from: optionalDate,
  to: optionalDate,
  cash: optionalText,
  head: optionalText,
  source: optionalText,
  direction: z.enum(['all', 'payments', 'receipts']).catch('all'),
  q: optionalText,
  page: z.coerce.number().int().min(1).catch(1),
})

export type DayBookFilter = z.infer<typeof dayBookFilterSchema>

function isSourceType(value: string | undefined): value is JournalSourceType {
  return !!value && (Object.values(JournalSourceType) as string[]).includes(value)
}

function monthStart(iso: string) {
  return `${iso.slice(0, 8)}01`
}

export function resolveRange(filter: Pick<DayBookFilter, 'from' | 'to'>) {
  const today = schoolToday()
  let from = filter.from ?? monthStart(filter.to ?? today)
  let to = filter.to ?? today
  if (from > to) [from, to] = [to, from]
  return { from, to }
}

type Enrichment = {
  voucherNumber?: string | null
  payee?: string | null
  mode?: string | null
  attachment?: { name: string; downloadUrl: string } | null
  sourceHref?: string | null
  expenseId?: string
  hasReceipt?: boolean
}

export type DayBookViewRow = DayBookRow & Enrichment

export async function getDayBook(ctx: AppContext, rawFilter: unknown) {
  await requireDayBook(ctx, 'accounts.view')
  const filter = dayBookFilterSchema.parse(rawFilter ?? {})
  const { from, to } = resolveRange(filter)
  const fromDay = attendanceDate(from)
  const toDay = attendanceDate(to)

  const allCash = await cashBankAccounts(ctx.db)
  const selectedCash = filter.cash ? allCash.filter((a) => a.id === filter.cash) : allCash
  if (filter.cash && !selectedCash.length) throw badRequest('Choose a cash or bank ledger from the list')
  const cashIds = new Set(selectedCash.map((a) => a.id))

  const where: Prisma.JournalEntryWhereInput = {
    date: { gte: fromDay, lte: toDay },
    lines: { some: { accountId: { in: [...cashIds] } } },
    ...(isSourceType(filter.source) ? { sourceType: filter.source } : {}),
    ...(filter.q
      ? {
          OR: [
            { number: { contains: filter.q, mode: 'insensitive' as const } },
            { narration: { contains: filter.q, mode: 'insensitive' as const } },
            { reference: { contains: filter.q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [entries, matching] = await Promise.all([
    cashIds.size
      ? ctx.db.journalEntry.findMany({
          where,
          orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
          take: DAY_BOOK_ROW_LIMIT + 1,
          select: {
            id: true, number: true, date: true, voucherType: true, sourceType: true, sourceId: true,
            narration: true, reference: true, isReversal: true, reversedAt: true, createdByLabel: true, createdAt: true,
            lines: { select: { accountId: true, debitMinor: true, creditMinor: true } },
          },
        })
      : Promise.resolve([]),
    cashIds.size ? ctx.db.journalEntry.count({ where }) : Promise.resolve(0),
  ])
  const truncated = entries.length > DAY_BOOK_ROW_LIMIT
  const built = entries
    .slice(0, DAY_BOOK_ROW_LIMIT)
    .map((e) => buildDayBookRow({ ...e, date: toIsoDay(e.date) } as DayBookEntry, cashIds))
    .filter((r): r is DayBookRow => r !== null)
  const rows = filterRows(built, { direction: filter.direction as DayBookDirection, headAccountId: filter.head })

  const totals = dayBookTotals(rows)
  const days = summariseDays(rows)
  const heads = summariseHeads(rows, filter.head)

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const page = Math.min(filter.page, pageCount)
  const pageRows = await enrich(ctx, rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE))

  const accountIds = new Set<string>([...heads.map((h) => h.accountId), ...allCash.map((a) => a.id)])
  for (const r of pageRows) for (const c of r.counter) accountIds.add(c.accountId)
  const accounts = await ctx.db.ledgerAccount.findMany({
    where: { id: { in: [...accountIds] } },
    select: { id: true, code: true, name: true, type: true },
  })

  return {
    range: { from, to },
    filter,
    cashAccounts: allCash,
    accounts: Object.fromEntries(accounts.map((a) => [a.id, a])),
    totals,
    days,
    heads,
    rows: pageRows,
    page,
    pageSize: PAGE_SIZE,
    total: rows.length,
    truncated,
    matchingEntries: matching,
  }
}

async function enrich(ctx: AppContext, rows: DayBookRow[]): Promise<DayBookViewRow[]> {
  const ids = (type: string) => [...new Set(rows.filter((r) => r.sourceType === type && r.sourceId).map((r) => r.sourceId!))]
  const expenseIds = ids('EXPENSE')
  const vendorPaymentIds = ids('VENDOR_PAYMENT')
  const canSeeReceipts = ctx.can('expenses.view')
  const [expenses, vendorPayments] = await Promise.all([
    expenseIds.length
      ? ctx.db.schoolExpense.findMany({
          where: { id: { in: expenseIds } },
          select: { id: true, voucherNumber: true, vendor: true, paymentMode: true, receiptKey: true, receiptName: true, recordedByLabel: true },
        })
      : Promise.resolve([]),
    vendorPaymentIds.length
      ? ctx.db.vendorPayment.findMany({
          where: { id: { in: vendorPaymentIds } },
          select: { id: true, number: true, mode: true, vendorId: true, vendor: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ])
  const expenseById = new Map(expenses.map((e) => [e.id, e]))
  const paymentById = new Map(vendorPayments.map((p) => [p.id, p]))

  return rows.map((r) => {
    if (r.sourceType === 'EXPENSE' && r.sourceId) {
      const e = expenseById.get(r.sourceId)
      if (!e) return r
      return {
        ...r,
        expenseId: e.id,
        voucherNumber: e.voucherNumber,
        payee: e.vendor,
        mode: e.paymentMode,
        hasReceipt: !!e.receiptKey,
        attachment: canSeeReceipts && e.receiptKey
          ? { name: e.receiptName ?? 'receipt', downloadUrl: `/api/v1/files/${encodeURIComponent(e.receiptKey)}` }
          : null,
        sourceHref: '/finance/expenses',
      }
    }
    if (r.sourceType === 'VENDOR_PAYMENT' && r.sourceId) {
      const p = paymentById.get(r.sourceId)
      if (!p) return r
      return { ...r, voucherNumber: p.number, payee: p.vendor.name, mode: p.mode, sourceHref: `/accounts/vendors/${p.vendorId}` }
    }
    return r
  })
}

// ------------------------------------------------------------ reconciliation

/**
 * For each cash / bank ledger: journal totals for the period straight from the
 * lines table, the register's own totals, and both closing balances.
 */
export async function getDayBookReconciliation(ctx: AppContext, rawFilter: unknown) {
  await requireDayBook(ctx, 'accounts.view')
  const filter = dayBookFilterSchema.parse(rawFilter ?? {})
  const { from, to } = resolveRange(filter)
  const fromDay = attendanceDate(from)
  const toDay = attendanceDate(to)
  const cash = await cashBankAccounts(ctx.db)
  const ids = cash.map((a) => a.id)
  if (!ids.length) return { range: { from, to }, accounts: [], allMatch: true, truncated: false, expenseIssues: [], autoPostExpenses: true }

  const [opening, before, period, through, entries] = await Promise.all([
    ctx.db.ledgerAccount.findMany({ where: { id: { in: ids } }, select: { id: true, openingBalanceMinor: true } }),
    ctx.db.journalLine.groupBy({ by: ['accountId'], where: { accountId: { in: ids }, entry: { date: { lt: fromDay } } }, _sum: { debitMinor: true, creditMinor: true } }),
    ctx.db.journalLine.groupBy({ by: ['accountId'], where: { accountId: { in: ids }, entry: { date: { gte: fromDay, lte: toDay } } }, _sum: { debitMinor: true, creditMinor: true } }),
    ctx.db.journalLine.groupBy({ by: ['accountId'], where: { accountId: { in: ids }, entry: { date: { lte: toDay } } }, _sum: { debitMinor: true, creditMinor: true } }),
    ctx.db.journalEntry.findMany({
      where: { date: { gte: fromDay, lte: toDay }, lines: { some: { accountId: { in: ids } } } },
      take: DAY_BOOK_ROW_LIMIT + 1,
      select: {
        id: true, number: true, date: true, voucherType: true, sourceType: true, sourceId: true,
        narration: true, reference: true, isReversal: true, reversedAt: true, createdByLabel: true, createdAt: true,
        lines: { select: { accountId: true, debitMinor: true, creditMinor: true } },
      },
    }),
  ])
  const truncated = entries.length > DAY_BOOK_ROW_LIMIT
  const cashIds = new Set(ids)
  const rows = entries
    .slice(0, DAY_BOOK_ROW_LIMIT)
    .map((e) => buildDayBookRow({ ...e, date: toIsoDay(e.date) } as DayBookEntry, cashIds))
    .filter((r): r is DayBookRow => r !== null)
  const register = movementByAccount(rows)
  const sumOf = (list: typeof period, id: string) => {
    const row = list.find((r) => r.accountId === id)
    return { debitMinor: row?._sum.debitMinor ?? 0, creditMinor: row?._sum.creditMinor ?? 0 }
  }
  const accounts = cash.map((a) => {
    const base = opening.find((o) => o.id === a.id)?.openingBalanceMinor ?? 0
    const b = sumOf(before, a.id)
    const t = sumOf(through, a.id)
    return {
      ...reconcileCashBank({
        accountId: a.id,
        openingMinor: base + b.debitMinor - b.creditMinor,
        ledger: sumOf(period, a.id),
        register: register.get(a.id) ?? { debitMinor: 0, creditMinor: 0 },
        ledgerClosingMinor: base + t.debitMinor - t.creditMinor,
      }),
      code: a.code,
      name: a.name,
    }
  })

  const [expenseIssues, settings] = await Promise.all([
    expensePostingIssues(ctx, fromDay, toDay),
    ctx.db.ledgerSettings.findFirst({ select: { autoPostExpenses: true } }),
  ])

  return {
    range: { from, to },
    accounts,
    allMatch: !truncated && accounts.every((a) => a.matches),
    truncated,
    expenseIssues,
    autoPostExpenses: settings?.autoPostExpenses ?? true,
  }
}

async function expensePostingIssues(ctx: AppContext, fromDay: Date, toDay: Date) {
  const expenses = await ctx.db.schoolExpense.findMany({
    where: { expenseDate: { gte: fromDay, lte: toDay } },
    select: { id: true, title: true, voucherNumber: true, amountMinor: true, expenseDate: true, deletedAt: true, cashAccountId: true },
    take: 5000,
  })
  if (!expenses.length) return []
  const cashActive = new Set((await cashBankAccounts(ctx.db)).filter((a) => a.isActive).map((a) => a.id))
  const posted = await ctx.db.journalEntry.findMany({
    where: { sourceType: 'EXPENSE', sourceId: { in: expenses.map((e) => e.id) }, isReversal: false, reversedAt: null },
    select: { sourceId: true, totalMinor: true, date: true, lines: { select: { accountId: true, creditMinor: true } } },
  })
  const issues = checkExpensePostings(
    expenses.map((e) => ({
      id: e.id,
      amountMinor: e.amountMinor,
      expenseDate: toIsoDay(e.expenseDate),
      deleted: !!e.deletedAt,
      cashAccountId: e.cashAccountId && cashActive.has(e.cashAccountId) ? e.cashAccountId : null,
    })),
    posted.map((p) => ({
      sourceId: p.sourceId!,
      totalMinor: p.totalMinor,
      date: toIsoDay(p.date),
      creditAccountIds: p.lines.filter((l) => l.creditMinor > 0).map((l) => l.accountId),
    })),
  )
  const byId = new Map(expenses.map((e) => [e.id, e]))
  return issues.map((i) => {
    const e = byId.get(i.expenseId)!
    return { ...i, title: e.title, voucherNumber: e.voucherNumber, amountMinor: e.amountMinor, expenseDate: toIsoDay(e.expenseDate) }
  })
}

/** Re-runs the existing expense posting for every mismatched expense in the range. */
export async function repairExpensePostings(ctx: AppContext, rawFilter: unknown) {
  await requireDayBook(ctx, 'accounts.manage')
  const filter = dayBookFilterSchema.parse(rawFilter ?? {})
  const { from, to } = resolveRange(filter)
  const settings = await ctx.db.ledgerSettings.findFirst({ select: { autoPostExpenses: true } })
  if (settings && !settings.autoPostExpenses) {
    throw badRequest('Automatic expense posting is switched off in ledger settings; switch it on to repair')
  }
  const issues = await expensePostingIssues(ctx, attendanceDate(from), attendanceDate(to))
  const batch = issues.slice(0, REPAIR_LIMIT)
  for (const issue of batch) await syncExpenseLedger(ctx.tenant.id, issue.expenseId)
  const remaining = await expensePostingIssues(ctx, attendanceDate(from), attendanceDate(to))
  await recordAccountingEvent(ctx.db, ctx.tenant.id, {
    entityType: 'DayBook',
    action: 'expense_postings_repaired',
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`.trim(),
    data: { from, to, attempted: batch.length, remaining: remaining.length },
  })
  return { attempted: batch.length, remaining: remaining.length }
}

// -------------------------------------------------------------- entry

export const DAY_BOOK_MODES = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'UPI'] as const

export const dayBookExpenseSchema = expenseSchema
  .extend({
    paymentMode: z.enum(DAY_BOOK_MODES),
    idempotencyKey: z.string().trim().min(8).max(100),
  })
  .refine((v) => v.paymentMode === 'CASH' || !!v.referenceNo, {
    message: 'Enter the cheque number, UTR or UPI reference',
    path: ['referenceNo'],
  })

/**
 * Records an immediately-paid expense (Dr expense head, Cr cash / bank) through
 * the existing expense module, then posts it straight away so the register and
 * the ledger agree before the page reloads. Safe to retry with the same key.
 */
export async function recordDayBookExpense(ctx: AppContext, raw: unknown) {
  const flags = await requireDayBook(ctx, 'expenses.manage')
  const input = dayBookExpenseSchema.parse(raw)
  await assertPostingAllowed(ctx.db, input.expenseDate, { startMonth: flags.fiscalYearStartMonth })
  if (flags.approvals) {
    const request = await createExpenseRequest(ctx, { ...input, amount: input.amount / 100, submit: true })
    return {
      id: request.id,
      voucherNumber: null,
      journalId: null,
      journalNumber: null,
      requestNumber: request.number,
      receiptUrl: `/api/v1/accounting/expense-approvals/${request.id}/receipt`,
    }
  }
  const expense = await createExpense(ctx, input)
  await syncExpenseLedger(ctx.tenant.id, expense.id)
  const entry = await ctx.db.journalEntry.findFirst({
    where: { sourceType: 'EXPENSE', sourceId: expense.id, isReversal: false, reversedAt: null },
    select: { id: true, number: true },
  })
  await recordAccountingEvent(ctx.db, ctx.tenant.id, {
    entityType: 'SchoolExpense',
    entityId: expense.id,
    action: 'day_book_expense_recorded',
    toStatus: entry ? 'POSTED' : 'PENDING_POSTING',
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`.trim(),
    correlationId: `day-book:${input.idempotencyKey}`,
    data: { voucherNumber: expense.voucherNumber, amountMinor: expense.amountMinor, journalNumber: entry?.number ?? null },
  })
  return {
    id: expense.id,
    voucherNumber: expense.voucherNumber,
    journalId: entry?.id ?? null,
    journalNumber: entry?.number ?? null,
    requestNumber: null,
    receiptUrl: `/api/v1/finance/expenses/${expense.id}/receipt`,
  }
}
