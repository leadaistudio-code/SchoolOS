import { z } from 'zod'
import type { ExpenseNature, JournalApprovalStatus, LedgerAccountType, LedgerMapKind, Prisma } from '@prisma/client'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { badRequest, conflict, notFound } from '@/server/api/response'
import { attendanceDate, toDateInput } from '@/lib/dates'
import { financialYearRange, schoolToday } from '@/lib/periods'
import {
  COLLECTION_MODES,
  EXPENSE_CATEGORIES,
  defaultExpenseKey,
  defaultFeeHeadKey,
  defaultModeKey,
  ensureChart,
  loadResolver,
} from './chart'
import { PENDING_STATUSES } from '@/server/modules/accounting/journal-approval'
import { naturalBalance, reverseLines, totals } from './math'
import { syncLedgerForTenant, writeJournalEntry } from './posting'
import { applyAccountNature } from '@/server/modules/finance/expense-heads'

export const ACCOUNT_TYPES: { type: LedgerAccountType; label: string; normal: 'Dr' | 'Cr' }[] = [
  { type: 'ASSET', label: 'Assets', normal: 'Dr' },
  { type: 'LIABILITY', label: 'Liabilities', normal: 'Cr' },
  { type: 'EQUITY', label: 'Capital & reserves', normal: 'Cr' },
  { type: 'INCOME', label: 'Income', normal: 'Cr' },
  { type: 'EXPENSE', label: 'Expenses', normal: 'Dr' },
]

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date')

export function defaultRange() {
  const today = schoolToday()
  return { from: financialYearRange(today).from, to: today }
}

function endOfDay(iso: string) {
  return attendanceDate(iso)
}

function actorLabel(ctx: AppContext) {
  return `${ctx.user.firstName} ${ctx.user.lastName}`.trim()
}

/* --------------------------------------------------------------- balances */

type Movement = { debit: number; credit: number }

/** Only owner-approved entries reach balances, statements and books. */
export const COUNTED_ENTRY = { approvalStatus: 'APPROVED' } as const satisfies Prisma.JournalEntryWhereInput

/** Debit and credit totals per account for entries dated within [from, to]. */
async function movements(
  ctx: AppContext,
  range: { from?: string; to?: string },
  statuses: JournalApprovalStatus[] = ['APPROVED'],
) {
  const date: Prisma.DateTimeFilter = {}
  if (range.from) date.gte = attendanceDate(range.from)
  if (range.to) date.lte = endOfDay(range.to)
  const rows = await ctx.db.journalLine.groupBy({
    by: ['accountId'],
    where: { entry: { approvalStatus: { in: statuses }, ...(range.from || range.to ? { date } : {}) } },
    _sum: { debitMinor: true, creditMinor: true },
  })
  return new Map<string, Movement>(
    rows.map((r) => [r.accountId, { debit: r._sum.debitMinor ?? 0, credit: r._sum.creditMinor ?? 0 }]),
  )
}

function dayBefore(iso: string) {
  const d = attendanceDate(iso)
  d.setUTCDate(d.getUTCDate() - 1)
  return toDateInput(d)
}

export type AccountBalanceRow = {
  id: string
  code: string
  name: string
  type: LedgerAccountType
  systemKey: string | null
  isActive: boolean
  description: string | null
  expenseNature: ExpenseNature | null
  openingBalanceMinor: number
  /** Debit-positive balance before `from`, including the opening balance. */
  openingMinor: number
  debitMinor: number
  creditMinor: number
  /** Debit-positive closing balance at `to`. */
  closingMinor: number
}

/** Every account with its opening, period movement and closing balance. */
export async function accountBalances(ctx: AppContext, range: { from?: string; to: string }) {
  ctx.require('accounts.view')
  await ensureChart(ctx.tenant.id, ctx.db)
  const [accounts, before, during] = await Promise.all([
    ctx.db.ledgerAccount.findMany({ orderBy: [{ code: 'asc' }] }),
    range.from ? movements(ctx, { to: dayBefore(range.from) }) : Promise.resolve(new Map<string, Movement>()),
    movements(ctx, { from: range.from, to: range.to }),
  ])
  return accounts.map<AccountBalanceRow>((a) => {
    const b = before.get(a.id) ?? { debit: 0, credit: 0 }
    const d = during.get(a.id) ?? { debit: 0, credit: 0 }
    const openingMinor = a.openingBalanceMinor + b.debit - b.credit
    return {
      id: a.id,
      code: a.code,
      name: a.name,
      type: a.type,
      systemKey: a.systemKey,
      isActive: a.isActive,
      description: a.description,
      expenseNature: a.expenseNature,
      openingBalanceMinor: a.openingBalanceMinor,
      openingMinor,
      debitMinor: d.debit,
      creditMinor: d.credit,
      closingMinor: openingMinor + d.debit - d.credit,
    }
  })
}

/* ------------------------------------------------------- chart of accounts */

const rupeesSigned = z.coerce.number().min(-1_000_000_000).max(1_000_000_000).transform((v) => Math.round(v * 100))

export const accountSchema = z.object({
  code: z.string().trim().min(1, 'Enter an account code').max(20).regex(/^[\w.-]+$/, 'Use letters, numbers, dot or dash'),
  name: z.string().trim().min(2, 'Enter an account name').max(120),
  type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']),
  description: z.string().trim().max(300).optional().or(z.literal('')),
  /** Rupees on the account's natural side (Dr for assets/expenses, Cr otherwise). */
  openingBalance: rupeesSigned.optional(),
  isActive: z.boolean().optional(),
  /** Expense accounts only. */
  expenseNature: z.enum(['DIRECT', 'INDIRECT']).optional(),
})

export const accountUpdateSchema = accountSchema.extend({ id: z.string().min(1) })

function toDebitPositive(type: LedgerAccountType, naturalMinor: number) {
  return type === 'ASSET' || type === 'EXPENSE' ? naturalMinor : -naturalMinor
}

export async function createAccount(ctx: AppContext, input: z.infer<typeof accountSchema>) {
  ctx.require('accounts.manage')
  const clash = await ctx.db.ledgerAccount.findFirst({ where: { code: input.code } })
  if (clash) throw conflict(`Account code ${input.code} is already used by ${clash.name}`)
  const created = await ctx.db.ledgerAccount.create({
    data: {
      tenantId: ctx.tenant.id,
      code: input.code,
      name: input.name,
      type: input.type,
      description: input.description || null,
      openingBalanceMinor: toDebitPositive(input.type, input.openingBalance ?? 0),
      expenseNature: input.type === 'EXPENSE' ? (input.expenseNature ?? 'INDIRECT') : null,
    },
  })
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: actorLabel(ctx),
    action: 'ledger_account.create',
    module: 'accounts',
    entityType: 'LedgerAccount',
    entityId: created.id,
    summary: `Created ledger account ${created.code} ${created.name}`,
    after: created,
  })
  return created
}

export async function updateAccount(ctx: AppContext, input: z.infer<typeof accountUpdateSchema>) {
  ctx.require('accounts.manage')
  const before = await ctx.db.ledgerAccount.findFirst({ where: { id: input.id } })
  if (!before) throw notFound('Account')
  if (input.code !== before.code) {
    const clash = await ctx.db.ledgerAccount.findFirst({ where: { code: input.code, id: { not: before.id } } })
    if (clash) throw conflict(`Account code ${input.code} is already used by ${clash.name}`)
  }
  if (input.type !== before.type) {
    if (before.systemKey) throw conflict('The type of a system account cannot be changed')
    const used = await ctx.db.journalLine.count({ where: { accountId: before.id } })
    if (used > 0) throw conflict('This account already has entries; its type cannot be changed')
  }
  if (input.isActive === false && before.systemKey) {
    throw conflict('System accounts are used for automatic posting and cannot be deactivated')
  }
  const nature = input.type === 'EXPENSE' ? (input.expenseNature ?? before.expenseNature ?? 'INDIRECT') : null
  const updated = await ctx.db.$transaction(async (tx) => {
    const row = await tx.ledgerAccount.update({
      where: { id: before.id },
      data: {
        code: input.code,
        name: input.name,
        type: input.type,
        description: input.description || null,
        openingBalanceMinor: toDebitPositive(input.type, input.openingBalance ?? 0),
        expenseNature: nature,
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      },
    })
    if (nature && nature !== before.expenseNature) await applyAccountNature(tx, before.id, nature)
    return row
  })
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: actorLabel(ctx),
    action: 'ledger_account.update',
    module: 'accounts',
    entityType: 'LedgerAccount',
    entityId: updated.id,
    summary: `Updated ledger account ${updated.code} ${updated.name}`,
    before,
    after: updated,
  })
  return updated
}

export async function accountOptions(ctx: AppContext, { includeInactive = false } = {}) {
  ctx.require('accounts.view')
  await ensureChart(ctx.tenant.id, ctx.db)
  return ctx.db.ledgerAccount.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: [{ code: 'asc' }],
    select: { id: true, code: true, name: true, type: true, systemKey: true },
  })
}

/* ---------------------------------------------------------------- journals */

const rupeesLine = z.coerce.number().min(0).max(1_000_000_000).transform((v) => Math.round(v * 100))

export const journalSchema = z.object({
  date: isoDate,
  voucherType: z.enum(['JOURNAL', 'RECEIPT', 'PAYMENT', 'CONTRA']),
  reference: z.string().trim().max(60).optional().or(z.literal('')),
  narration: z.string().trim().min(3, 'Write a narration').max(500),
  lines: z
    .array(
      z.object({
        accountId: z.string().min(1, 'Choose an account'),
        debit: rupeesLine.default(0),
        credit: rupeesLine.default(0),
        memo: z.string().trim().max(200).optional().or(z.literal('')),
      }),
    )
    .min(2, 'A voucher needs at least two lines'),
})

export async function createManualJournal(ctx: AppContext, input: z.infer<typeof journalSchema>) {
  ctx.require('accounts.manage')
  const lines = input.lines.filter((l) => l.debit > 0 || l.credit > 0)
  if (lines.some((l) => l.debit > 0 && l.credit > 0)) {
    throw badRequest('Each line is either a debit or a credit, not both')
  }
  const sum = totals(lines.map((l) => ({ accountId: l.accountId, debitMinor: l.debit, creditMinor: l.credit })))
  if (lines.length < 2 || sum.debit <= 0) throw badRequest('Enter at least one debit and one credit line')
  if (!sum.balanced) {
    throw badRequest(`Debits (${(sum.debit / 100).toFixed(2)}) and credits (${(sum.credit / 100).toFixed(2)}) must be equal`)
  }
  const date = attendanceDate(input.date)
  if (date.getTime() > attendanceDate(schoolToday()).getTime()) throw badRequest('Voucher date cannot be in the future')

  const ids = [...new Set(lines.map((l) => l.accountId))]
  const accounts = await ctx.db.ledgerAccount.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true } })
  if (accounts.length !== ids.length) throw badRequest('One of the accounts is missing or inactive')
  if (ids.length < 2) throw badRequest('Debit and credit must be on different accounts')

  const entry = await ctx.db.$transaction((tx) =>
    writeJournalEntry(tx, ctx.tenant.id, {
      date,
      voucherType: input.voucherType,
      narration: input.narration,
      reference: input.reference || null,
      lines: lines.map((l) => ({ accountId: l.accountId, debitMinor: l.debit, creditMinor: l.credit, memo: l.memo || null })),
      sourceType: 'MANUAL',
      sourceId: null,
      postingKey: null,
      createdById: ctx.user.userId,
      createdByLabel: actorLabel(ctx),
    }),
  )
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: actorLabel(ctx),
    action: 'journal.create',
    module: 'accounts',
    entityType: 'JournalEntry',
    entityId: entry.id,
    summary: `Posted ${input.voucherType.toLowerCase()} voucher ${entry.number} for ${(sum.debit / 100).toFixed(2)}: ${input.narration}`,
  })
  return entry
}

export const reverseJournalSchema = z.object({
  id: z.string().min(1),
  reason: z.string().trim().min(5, 'Give a reason for the reversal').max(300),
})

/** Manual vouchers are reversed with an opposite entry; never edited or deleted. */
export async function reverseManualJournal(ctx: AppContext, input: z.infer<typeof reverseJournalSchema>) {
  ctx.require('accounts.manage')
  const entry = await ctx.db.journalEntry.findFirst({ where: { id: input.id }, include: { lines: true } })
  if (!entry) throw notFound('Voucher')
  if (entry.sourceType !== 'MANUAL') {
    throw conflict('Automatic entries follow their receipt or expense; cancel or edit the source document instead')
  }
  if (entry.isReversal) throw conflict('A reversal entry cannot itself be reversed')
  if (entry.reversedAt) throw conflict('This voucher has already been reversed')

  const reversal = await ctx.db.$transaction(async (tx) => {
    const claimed = await tx.journalEntry.updateMany({
      where: { id: entry.id, reversedAt: null },
      data: { reversedAt: new Date() },
    })
    if (claimed.count !== 1) throw conflict('This voucher was already reversed by another user')
    return writeJournalEntry(tx, ctx.tenant.id, {
      date: attendanceDate(schoolToday()),
      voucherType: entry.voucherType,
      narration: `Reversal of ${entry.number}: ${input.reason}`,
      reference: entry.reference,
      lines: reverseLines(entry.lines),
      sourceType: 'MANUAL',
      sourceId: null,
      postingKey: `MANUAL:rev:${entry.id}`,
      isReversal: true,
      reversalOfId: entry.id,
      createdById: ctx.user.userId,
      createdByLabel: actorLabel(ctx),
    })
  })
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: actorLabel(ctx),
    action: 'journal.reverse',
    module: 'accounts',
    entityType: 'JournalEntry',
    entityId: entry.id,
    summary: `Reversed voucher ${entry.number} with ${reversal.number}: ${input.reason}`,
  })
  return reversal
}

export const journalFilterSchema = z.object({
  from: isoDate.optional().or(z.literal('').transform(() => undefined)),
  to: isoDate.optional().or(z.literal('').transform(() => undefined)),
  type: z.enum(['JOURNAL', 'RECEIPT', 'PAYMENT', 'CONTRA']).optional().or(z.literal('').transform(() => undefined)),
  source: z.enum(['MANUAL', 'FEE_PAYMENT', 'FEE_REFUND', 'EXPENSE']).optional().or(z.literal('').transform(() => undefined)),
  q: z.string().trim().max(80).optional(),
})

export async function listJournals(
  ctx: AppContext,
  filter: z.infer<typeof journalFilterSchema>,
  page = 1,
  pageSize = 50,
) {
  ctx.require('accounts.view')
  const range = { ...defaultRange(), ...(filter.from ? { from: filter.from } : {}), ...(filter.to ? { to: filter.to } : {}) }
  const where: Prisma.JournalEntryWhereInput = {
    date: { gte: attendanceDate(range.from), lte: endOfDay(range.to) },
    ...(filter.type ? { voucherType: filter.type } : {}),
    ...(filter.source ? { sourceType: filter.source } : {}),
    ...(filter.q
      ? {
          OR: [
            { number: { contains: filter.q, mode: 'insensitive' } },
            { reference: { contains: filter.q, mode: 'insensitive' } },
            { narration: { contains: filter.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  }
  const [rows, total] = await Promise.all([
    ctx.db.journalEntry.findMany({
      where,
      orderBy: [{ date: 'desc' }, { number: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        lines: { include: { account: { select: { code: true, name: true } } }, orderBy: { debitMinor: 'desc' } },
      },
    }),
    ctx.db.journalEntry.count({ where }),
  ])
  return { range, rows, total }
}

export async function getJournal(ctx: AppContext, id: string) {
  ctx.require('accounts.view')
  const entry = await ctx.db.journalEntry.findFirst({
    where: { id },
    include: {
      lines: { include: { account: { select: { id: true, code: true, name: true, type: true } } }, orderBy: { debitMinor: 'desc' } },
    },
  })
  if (!entry) throw notFound('Voucher')
  const [reversal, original] = await Promise.all([
    ctx.db.journalEntry.findFirst({ where: { reversalOfId: entry.id }, select: { id: true, number: true } }),
    entry.reversalOfId
      ? ctx.db.journalEntry.findFirst({ where: { id: entry.reversalOfId }, select: { id: true, number: true } })
      : Promise.resolve(null),
  ])
  return { entry, reversal, original }
}

/* ---------------------------------------------------------- general ledger */

export async function generalLedger(ctx: AppContext, params: { accountId: string; from: string; to: string }) {
  ctx.require('accounts.view')
  const account = await ctx.db.ledgerAccount.findFirst({ where: { id: params.accountId } })
  if (!account) throw notFound('Account')
  const [before, lines] = await Promise.all([
    ctx.db.journalLine.aggregate({
      where: { accountId: account.id, entry: { ...COUNTED_ENTRY, date: { lt: attendanceDate(params.from) } } },
      _sum: { debitMinor: true, creditMinor: true },
    }),
    ctx.db.journalLine.findMany({
      where: {
        accountId: account.id,
        entry: { ...COUNTED_ENTRY, date: { gte: attendanceDate(params.from), lte: endOfDay(params.to) } },
      },
      include: {
        entry: {
          select: {
            id: true, number: true, date: true, voucherType: true, reference: true, narration: true,
            sourceType: true, sourceId: true, isReversal: true, createdAt: true,
            lines: { select: { accountId: true, debitMinor: true, creditMinor: true, account: { select: { name: true } } } },
          },
        },
      },
    }),
  ])
  lines.sort((a, b) =>
    a.entry.date.getTime() - b.entry.date.getTime()
    || a.entry.createdAt.getTime() - b.entry.createdAt.getTime()
    || a.entry.number.localeCompare(b.entry.number))

  const openingMinor = account.openingBalanceMinor + (before._sum.debitMinor ?? 0) - (before._sum.creditMinor ?? 0)
  let running = openingMinor
  const rows = lines.map((l) => {
    running += l.debitMinor - l.creditMinor
    // "Particulars" = the other side(s) of the voucher, as in a Tally ledger.
    const contra = l.entry.lines
      .filter((o) => o.accountId !== account.id && (l.debitMinor > 0 ? o.creditMinor > 0 : o.debitMinor > 0))
      .map((o) => o.account.name)
    return {
      id: l.id,
      entryId: l.entry.id,
      number: l.entry.number,
      date: l.entry.date,
      voucherType: l.entry.voucherType,
      reference: l.entry.reference,
      narration: l.entry.narration,
      sourceType: l.entry.sourceType,
      sourceId: l.entry.sourceId,
      particulars: [...new Set(contra)].join(', ') || '—',
      debitMinor: l.debitMinor,
      creditMinor: l.creditMinor,
      balanceMinor: running,
    }
  })
  const debitMinor = rows.reduce((t, r) => t + r.debitMinor, 0)
  const creditMinor = rows.reduce((t, r) => t + r.creditMinor, 0)
  return { account, openingMinor, rows, debitMinor, creditMinor, closingMinor: running }
}

/* --------------------------------------------------- financial statements */

/**
 * Expenses in the approval pipeline that have no journal entry yet, as the
 * lines they will post: Dr the head's account, Cr the cash / bank paid from.
 */
async function pendingRequestMovements(ctx: AppContext, to: string) {
  const out = new Map<string, Movement>()
  const requests = await ctx.db.expenseApprovalRequest.findMany({
    where: { status: { in: ['SUBMITTED', 'PENDING_L1', 'PENDING_L2', 'PENDING_FINAL'] }, expenseId: null, expenseDate: { lte: endOfDay(to) } },
    select: { amountMinor: true, headId: true, cashAccountId: true, paymentMode: true },
  })
  if (!requests.length) return { movements: out, count: 0 }
  const resolve = await loadResolver(ctx.tenant.id, ctx.db)
  const heads = await ctx.db.expenseHead.findMany({
    where: { id: { in: [...new Set(requests.map((r) => r.headId))] } },
    select: { id: true, category: true, account: { select: { id: true, isActive: true } } },
  })
  const headOf = new Map(heads.map((h) => [h.id, h]))
  const add = (accountId: string, debit: number, credit: number) => {
    const m = out.get(accountId) ?? { debit: 0, credit: 0 }
    out.set(accountId, { debit: m.debit + debit, credit: m.credit + credit })
  }
  for (const r of requests) {
    const head = headOf.get(r.headId)
    add(head?.account?.isActive ? head.account.id : resolve.expense(head?.category ?? 'OTHER'), r.amountMinor, 0)
    add(r.cashAccountId ?? resolve.mode(r.paymentMode), 0, r.amountMinor)
  }
  return { movements: out, count: requests.length }
}

/**
 * Approved balances, and beside them every cost still awaiting approval up to
 * `to`: journal entries in the approval chain and expenses not yet posted.
 * Pending figures never enter the P&L or balance sheet.
 */
export async function trialBalance(ctx: AppContext, params: { from: string; to: string }) {
  const [balances, pendingEntries, requests, pendingCount] = await Promise.all([
    accountBalances(ctx, params),
    movements(ctx, { to: params.to }, PENDING_STATUSES),
    pendingRequestMovements(ctx, params.to),
    ctx.db.journalEntry.count({ where: { approvalStatus: { in: PENDING_STATUSES }, date: { lte: endOfDay(params.to) } } }),
  ])
  const pendingOf = (id: string) => {
    const a = pendingEntries.get(id) ?? { debit: 0, credit: 0 }
    const b = requests.movements.get(id) ?? { debit: 0, credit: 0 }
    return { debit: a.debit + b.debit, credit: a.credit + b.credit }
  }
  const rows = balances
    .map((r) => {
      const p = pendingOf(r.id)
      return {
        ...r,
        pendingDebitMinor: p.debit,
        pendingCreditMinor: p.credit,
        closingWithPendingMinor: r.closingMinor + p.debit - p.credit,
      }
    })
    .filter(
      (r) => r.openingMinor !== 0 || r.debitMinor !== 0 || r.creditMinor !== 0 || r.closingMinor !== 0
        || r.pendingDebitMinor !== 0 || r.pendingCreditMinor !== 0,
    )
  const closingDr = rows.reduce((t, r) => t + Math.max(0, r.closingMinor), 0)
  const closingCr = rows.reduce((t, r) => t + Math.max(0, -r.closingMinor), 0)
  return {
    rows,
    pending: { entries: pendingCount, expenseRequests: requests.count },
    totals: {
      debitMinor: rows.reduce((t, r) => t + r.debitMinor, 0),
      creditMinor: rows.reduce((t, r) => t + r.creditMinor, 0),
      closingDrMinor: closingDr,
      closingCrMinor: closingCr,
      differenceMinor: closingDr - closingCr,
      pendingDebitMinor: rows.reduce((t, r) => t + r.pendingDebitMinor, 0),
      pendingCreditMinor: rows.reduce((t, r) => t + r.pendingCreditMinor, 0),
    },
  }
}

export async function profitAndLoss(ctx: AppContext, params: { from: string; to: string }) {
  const rows = await accountBalances(ctx, params)
  const pick = (type: LedgerAccountType) =>
    rows
      .filter((r) => r.type === type)
      .map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        expenseNature: r.expenseNature,
        amountMinor: naturalBalance(type, r.debitMinor - r.creditMinor),
      }))
      .filter((r) => r.amountMinor !== 0)
  const income = pick('INCOME')
  const expenses = pick('EXPENSE')
  const directExpenses = expenses.filter((r) => r.expenseNature === 'DIRECT')
  const indirectExpenses = expenses.filter((r) => r.expenseNature !== 'DIRECT')
  const sum = (list: { amountMinor: number }[]) => list.reduce((t, r) => t + r.amountMinor, 0)
  const incomeMinor = sum(income)
  const directMinor = sum(directExpenses)
  const indirectMinor = sum(indirectExpenses)
  const expenseMinor = directMinor + indirectMinor
  return {
    income,
    expenses,
    directExpenses,
    indirectExpenses,
    incomeMinor,
    directMinor,
    indirectMinor,
    expenseMinor,
    grossSurplusMinor: incomeMinor - directMinor,
    surplusMinor: incomeMinor - expenseMinor,
  }
}

export async function balanceSheet(ctx: AppContext, params: { asOf: string }) {
  const rows = await accountBalances(ctx, { to: params.asOf })
  const fy = financialYearRange(params.asOf)
  const pl = await profitAndLoss(ctx, { from: fy.from, to: params.asOf })
  const side = (type: LedgerAccountType) =>
    rows
      .filter((r) => r.type === type)
      .map((r) => ({ id: r.id, code: r.code, name: r.name, amountMinor: naturalBalance(type, r.closingMinor) }))
      .filter((r) => r.amountMinor !== 0)
  const assets = side('ASSET')
  const liabilities = side('LIABILITY')
  const equity = side('EQUITY')
  // Income and expense closings to date, split into this year's surplus and
  // earlier years' retained surplus.
  const allIncome = rows.filter((r) => r.type === 'INCOME').reduce((t, r) => t - r.closingMinor, 0)
  const allExpense = rows.filter((r) => r.type === 'EXPENSE').reduce((t, r) => t + r.closingMinor, 0)
  const cumulativeSurplus = allIncome - allExpense
  const currentSurplus = pl.surplusMinor
  const retainedSurplus = cumulativeSurplus - currentSurplus

  const assetsMinor = assets.reduce((t, r) => t + r.amountMinor, 0)
  const liabilitiesMinor = liabilities.reduce((t, r) => t + r.amountMinor, 0)
  const equityMinor = equity.reduce((t, r) => t + r.amountMinor, 0)
  const fundsMinor = liabilitiesMinor + equityMinor + cumulativeSurplus
  return {
    asOf: params.asOf,
    assets,
    liabilities,
    equity,
    retainedSurplusMinor: retainedSurplus,
    currentSurplusMinor: currentSurplus,
    assetsMinor,
    liabilitiesMinor,
    equityMinor,
    fundsMinor,
    // Non-zero only when opening balances entered by the school do not balance.
    openingDifferenceMinor: assetsMinor - fundsMinor,
  }
}

/* ---------------------------------------------------- posting setup / sync */

export async function getPostingSetup(ctx: AppContext) {
  ctx.require('accounts.view')
  await ensureChart(ctx.tenant.id, ctx.db)
  const [settings, maps, heads, accounts, entryCount, tally] = await Promise.all([
    ctx.db.ledgerSettings.findUnique({ where: { tenantId: ctx.tenant.id } }),
    ctx.db.ledgerAccountMap.findMany(),
    ctx.db.feeHead.findMany({ where: { deletedAt: null }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    ctx.db.ledgerAccount.findMany({ orderBy: { code: 'asc' }, select: { id: true, code: true, name: true, type: true, systemKey: true, isActive: true } }),
    ctx.db.journalEntry.count(),
    ctx.db.tallyIntegration.findUnique({ where: { tenantId: ctx.tenant.id }, select: { enabled: true } }),
  ])
  const bySystem = new Map(accounts.filter((a) => a.systemKey).map((a) => [a.systemKey as string, a]))
  const mapOf = new Map(maps.map((m) => [`${m.kind}:${m.localKey}`, m.accountId]))
  const row = (kind: LedgerMapKind, key: string, label: string, fallbackKey: string) => ({
    kind,
    key,
    label,
    accountId: mapOf.get(`${kind}:${key}`) ?? '',
    defaultAccount: bySystem.get(fallbackKey) ?? null,
  })
  return {
    settings: {
      autoPostFees: settings?.autoPostFees ?? true,
      autoPostExpenses: settings?.autoPostExpenses ?? true,
      autoPostStore: settings?.autoPostStore ?? true,
      lastSyncedAt: settings?.lastSyncedAt ?? null,
    },
    tallyEnabled: !!tally?.enabled,
    entryCount,
    accounts,
    feeHeads: heads.map((h) => row('FEE_HEAD', h.id, h.name, defaultFeeHeadKey(h.name, h.isDeposit))),
    modes: COLLECTION_MODES.map((m) => row('PAYMENT_MODE', m, m.replaceAll('_', ' ').toLowerCase(), defaultModeKey(m))),
    expenseCategories: EXPENSE_CATEGORIES.map((c) => row('EXPENSE_CATEGORY', c, c.toLowerCase(), defaultExpenseKey(c))),
  }
}

export const mappingSchema = z.object({
  kind: z.enum(['FEE_HEAD', 'PAYMENT_MODE', 'EXPENSE_CATEGORY']),
  localKey: z.string().min(1).max(80),
  accountId: z.string().max(40),
})

/** Empty accountId falls back to the default system account. Applies to new postings. */
export async function setMapping(ctx: AppContext, input: z.infer<typeof mappingSchema>) {
  ctx.require('accounts.manage')
  if (!input.accountId) {
    await ctx.db.ledgerAccountMap.deleteMany({ where: { kind: input.kind, localKey: input.localKey } })
  } else {
    const account = await ctx.db.ledgerAccount.findFirst({ where: { id: input.accountId, isActive: true } })
    if (!account) throw badRequest('Choose an active account')
    await ctx.db.ledgerAccountMap.upsert({
      where: { tenantId_kind_localKey: { tenantId: ctx.tenant.id, kind: input.kind, localKey: input.localKey } },
      create: { tenantId: ctx.tenant.id, kind: input.kind, localKey: input.localKey, accountId: account.id },
      update: { accountId: account.id },
    })
  }
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: actorLabel(ctx),
    action: 'ledger_mapping.set',
    module: 'accounts',
    entityType: 'LedgerAccountMap',
    entityId: `${input.kind}:${input.localKey}`,
    summary: `Posting rule ${input.kind.toLowerCase()} ${input.localKey} → ${input.accountId || 'default account'}`,
  })
}

export const ledgerSettingsSchema = z.object({
  autoPostFees: z.boolean(),
  autoPostExpenses: z.boolean(),
  autoPostStore: z.boolean(),
})

export async function updateLedgerSettings(ctx: AppContext, input: z.infer<typeof ledgerSettingsSchema>) {
  ctx.require('accounts.manage')
  await ctx.db.ledgerSettings.upsert({
    where: { tenantId: ctx.tenant.id },
    create: { tenantId: ctx.tenant.id, ...input },
    update: input,
  })
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: actorLabel(ctx),
    action: 'ledger_settings.update',
    module: 'accounts',
    entityType: 'LedgerSettings',
    entityId: ctx.tenant.id,
    summary: `Automatic posting: fees ${input.autoPostFees ? 'on' : 'off'}, expenses ${input.autoPostExpenses ? 'on' : 'off'}, store ${input.autoPostStore ? 'on' : 'off'}`,
  })
}

/**
 * Posts anything not yet in the books. `full` re-checks every document, which
 * also re-posts documents whose accounts changed because a rule was edited.
 */
export async function runLedgerSync(ctx: AppContext, full: boolean) {
  ctx.require('accounts.manage')
  const summary = await syncLedgerForTenant(ctx.tenant.id, { full })
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: actorLabel(ctx),
    action: 'ledger.sync',
    module: 'accounts',
    entityType: 'LedgerSettings',
    entityId: ctx.tenant.id,
    summary: `Books ${full ? 'rebuilt' : 'synced'}: ${summary.posted} posted, ${summary.reposted} corrected, ${summary.reversed} reversed`,
  })
  return summary
}

/** Opening balances must net to zero; the gap is shown against Capital. */
export async function openingBalanceCheck(ctx: AppContext) {
  ctx.require('accounts.view')
  const agg = await ctx.db.ledgerAccount.aggregate({ _sum: { openingBalanceMinor: true } })
  return agg._sum.openingBalanceMinor ?? 0
}
