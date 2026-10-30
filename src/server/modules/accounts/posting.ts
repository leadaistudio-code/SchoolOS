import { Prisma, type JournalApprovalStatus, type JournalSourceType, type JournalVoucherType } from '@prisma/client'
import { getAccountingFlags } from '@/server/modules/accounting/service'
import { initialStatus } from '@/server/modules/accounting/journal-approval'
import { tenantDb, type TenantClient } from '@/server/db/tenant-client'
import { nextDocumentNumber, financialYearLabel } from '@/server/numbering'
import { attendanceDate } from '@/lib/dates'
import { loadResolver, type AccountResolver } from './chart'
import {
  normalizeLines,
  reverseLines,
  sameLines,
  splitInvoiceAmount,
  totals,
  type DraftLine,
} from './math'

const DAY_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' })

/** Calendar day a timestamp falls on for the school (stored dates pass through). */
export function bookDay(d: Date): Date {
  const isUtcMidnight = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0
  return isUtcMidnight ? attendanceDate(d) : attendanceDate(DAY_FMT.format(d))
}

type Desired = {
  date: Date
  voucherType: JournalVoucherType
  narration: string
  reference: string | null
  lines: DraftLine[]
}

type WriteClient = Pick<TenantClient, 'journalEntry' | '$queryRawUnsafe' | 'ledgerAccount' | 'accountingSettings'>

type EntryInput = Desired & {
  sourceType: JournalSourceType
  sourceId: string | null
  postingKey: string | null
  isReversal?: boolean
  reversalOfId?: string | null
  createdById?: string | null
  createdByLabel?: string | null
  /** Already signed off elsewhere (an expense that went through expense approval). */
  preApproved?: boolean
}

async function approvalStatusFor(tx: WriteClient, entry: EntryInput, accountIds: string[]): Promise<JournalApprovalStatus> {
  if (entry.isReversal && entry.reversalOfId) {
    const original = await tx.journalEntry.findFirst({ where: { id: entry.reversalOfId }, select: { approvalStatus: true } })
    const reversalOf = original?.approvalStatus ?? 'APPROVED'
    if (reversalOf !== 'APPROVED' && reversalOf !== 'VOID') {
      await tx.journalEntry.updateMany({ where: { id: entry.reversalOfId }, data: { approvalStatus: 'VOID' } })
    }
    return initialStatus({ workflowOn: false, sourceType: entry.sourceType, accountTypes: [], reversalOf })
  }
  if (entry.preApproved) return 'APPROVED'
  const flags = await getAccountingFlags(tx)
  if (!flags.approvals) return 'APPROVED'
  const accounts = await tx.ledgerAccount.findMany({ where: { id: { in: accountIds } }, select: { type: true } })
  return initialStatus({ workflowOn: true, sourceType: entry.sourceType, accountTypes: accounts.map((a) => a.type) })
}

export async function writeJournalEntry(tx: WriteClient, tenantId: string, entry: EntryInput) {
  const lines = normalizeLines(entry.lines)
  const sum = totals(lines)
  if (!sum.balanced || sum.debit <= 0 || lines.length < 2) {
    throw new Error('A journal entry needs at least two lines with equal debits and credits')
  }
  const approvalStatus = await approvalStatusFor(tx, entry, [...new Set(lines.map((l) => l.accountId))])
  const number = await nextDocumentNumber(tx, {
    tenantId,
    kind: 'JOURNAL',
    sessionLabel: financialYearLabel(entry.date),
  })
  return tx.journalEntry.create({
    data: {
      tenantId,
      number,
      voucherType: entry.voucherType,
      date: entry.date,
      reference: entry.reference,
      narration: entry.narration.slice(0, 500),
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      postingKey: entry.postingKey,
      totalMinor: sum.debit,
      isReversal: entry.isReversal ?? false,
      reversalOfId: entry.reversalOfId ?? null,
      createdById: entry.createdById ?? null,
      createdByLabel: entry.createdByLabel ?? 'System',
      approvalStatus,
      ...(approvalStatus === 'APPROVED' ? { approvedAt: new Date(), approvedById: entry.createdById ?? null } : {}),
      lines: {
        create: lines.map((l) => ({
          tenantId,
          accountId: l.accountId,
          debitMinor: l.debitMinor,
          creditMinor: l.creditMinor,
          memo: l.memo ?? null,
        })),
      },
    },
  })
}

export type SyncOutcome = 'unchanged' | 'posted' | 'reposted' | 'reversed' | 'skipped'

/**
 * Brings the books in line with the current state of one source document.
 * The active entry is compared with what the document should post now; if they
 * differ the old entry is reversed (never edited) and a new version posted.
 */
async function reconcileSource(
  db: TenantClient,
  tenantId: string,
  sourceType: JournalSourceType,
  sourceId: string,
  desired: Desired | null,
  voidedOn: Date,
): Promise<SyncOutcome> {
  const active = await db.journalEntry.findFirst({
    where: { sourceType, sourceId, isReversal: false, reversedAt: null },
    include: { lines: true },
    orderBy: { createdAt: 'desc' },
  })
  const lines = desired ? normalizeLines(desired.lines) : []
  if (!active && lines.length === 0) return 'unchanged'
  if (
    active && desired && lines.length > 0
    && sameLines(active.lines, lines)
    && active.date.getTime() === desired.date.getTime()
  ) {
    return 'unchanged'
  }

  const version = await db.journalEntry.count({ where: { sourceType, sourceId, isReversal: false } })
  try {
    await db.$transaction(async (tx) => {
      if (active) {
        const claimed = await tx.journalEntry.updateMany({
          where: { id: active.id, reversedAt: null },
          data: { reversedAt: new Date() },
        })
        if (claimed.count !== 1) throw new SkipPosting()
        const reversalDate = lines.length > 0 || voidedOn < active.date ? active.date : voidedOn
        await writeJournalEntry(tx, tenantId, {
          date: reversalDate,
          voucherType: active.voucherType,
          narration: lines.length > 0
            ? `Correction: reverses ${active.number}`
            : `Reversal of ${active.number}${desired ? '' : ' (source cancelled)'}`,
          reference: active.reference,
          lines: reverseLines(active.lines),
          sourceType,
          sourceId,
          postingKey: `${sourceType}:${sourceId}:rev:${active.id}`,
          isReversal: true,
          reversalOfId: active.id,
        })
      }
      if (desired && lines.length > 0) {
        await writeJournalEntry(tx, tenantId, {
          ...desired,
          lines,
          sourceType,
          sourceId,
          postingKey: `${sourceType}:${sourceId}:v${version + 1}`,
        })
      }
    })
  } catch (err) {
    if (err instanceof SkipPosting) return 'skipped'
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return 'skipped'
    throw err
  }
  if (!active) return 'posted'
  return lines.length > 0 ? 'reposted' : 'reversed'
}

class SkipPosting extends Error {}

/** Statuses where the money is (or was) in the school's hands. */
const RECEIVED = new Set(['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED'])

async function desiredPayment(db: TenantClient, resolve: AccountResolver, paymentId: string) {
  const payment = await db.feePayment.findFirst({
    where: { id: paymentId },
    include: {
      receipt: { select: { number: true } },
      student: { select: { firstName: true, lastName: true, admissionNo: true } },
      allocations: {
        include: {
          invoice: {
            select: {
              number: true,
              lateFeeMinor: true,
              lines: { select: { feeHeadId: true, label: true, amountMinor: true, discountMinor: true, taxPercent: true } },
            },
          },
        },
      },
    },
  })
  if (!payment) return { payment: null, desired: null }
  if (!RECEIVED.has(payment.status) || payment.amountMinor <= 0) return { payment, desired: null }

  const lines: DraftLine[] = [
    { accountId: resolve.mode(payment.mode), debitMinor: payment.amountMinor, creditMinor: 0 },
  ]
  let allocated = 0
  for (const allocation of payment.allocations) {
    allocated += allocation.amountMinor
    for (const slice of splitInvoiceAmount(allocation.invoice, allocation.amountMinor)) {
      lines.push({
        accountId: resolve.feeHead(slice.feeHeadId, slice.label, slice.isLateFee),
        debitMinor: 0,
        creditMinor: slice.amountMinor,
      })
    }
  }
  const advance = payment.amountMinor - allocated
  if (advance !== 0) {
    lines.push({
      accountId: resolve.system('ADVANCE_FEES'),
      debitMinor: advance < 0 ? -advance : 0,
      creditMinor: advance > 0 ? advance : 0,
    })
  }

  const student = `${payment.student.firstName} ${payment.student.lastName} (${payment.student.admissionNo})`
  const clearedOn = (payment.providerResponse as { cheque?: { clearedOn?: unknown } } | null)?.cheque?.clearedOn
  const desired: Desired = {
    // A cheque reaches the bank on the day it clears, not the day it was handed in.
    date: typeof clearedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(clearedOn)
      ? attendanceDate(clearedOn)
      : bookDay(payment.paidAt ?? payment.createdAt),
    voucherType: 'RECEIPT',
    narration: `Fee received from ${student} via ${payment.mode.replaceAll('_', ' ').toLowerCase()}${
      payment.reference ? ` ref ${payment.reference}` : ''
    }`,
    reference: payment.receipt?.number ?? null,
    lines,
  }
  return { payment, desired }
}

async function desiredRefund(db: TenantClient, resolve: AccountResolver, refundId: string) {
  const refund = await db.feeRefund.findFirst({
    where: { id: refundId },
    include: {
      payment: { select: { mode: true, receipt: { select: { number: true } } } },
      allocations: {
        include: {
          invoice: {
            select: {
              lateFeeMinor: true,
              lines: { select: { feeHeadId: true, label: true, amountMinor: true, discountMinor: true, taxPercent: true } },
            },
          },
        },
      },
    },
  })
  if (!refund) return { refund: null, desired: null }
  if (refund.status !== 'SUCCESS' || refund.amountMinor <= 0) return { refund, desired: null }

  const lines: DraftLine[] = [
    { accountId: resolve.mode(refund.payment.mode), debitMinor: 0, creditMinor: refund.amountMinor },
  ]
  let allocated = 0
  for (const allocation of refund.allocations) {
    allocated += allocation.amountMinor
    for (const slice of splitInvoiceAmount(allocation.invoice, allocation.amountMinor)) {
      lines.push({
        accountId: resolve.feeHead(slice.feeHeadId, slice.label, slice.isLateFee),
        debitMinor: slice.amountMinor,
        creditMinor: 0,
      })
    }
  }
  const fromAdvance = refund.amountMinor - allocated
  if (fromAdvance !== 0) {
    lines.push({
      accountId: resolve.system('ADVANCE_FEES'),
      debitMinor: fromAdvance > 0 ? fromAdvance : 0,
      creditMinor: fromAdvance < 0 ? -fromAdvance : 0,
    })
  }
  const desired: Desired = {
    date: bookDay(refund.completedAt ?? refund.createdAt),
    voucherType: 'PAYMENT',
    narration: `Fee refund against ${refund.payment.receipt?.number ?? 'receipt'}: ${refund.reason}`,
    reference: refund.payment.receipt?.number ?? null,
    lines,
  }
  return { refund, desired }
}

async function desiredExpense(db: Pick<TenantClient, 'schoolExpense' | 'ledgerAccount'>, resolve: AccountResolver, expenseId: string) {
  const expense = await db.schoolExpense.findFirst({
    where: { id: expenseId },
    include: { head: { select: { account: { select: { id: true, isActive: true } } } } },
  })
  if (!expense) return { expense: null, desired: null }
  if (expense.deletedAt || expense.amountMinor <= 0) return { expense, desired: null }
  const headAccount = expense.head?.account
  const expenseAccount = headAccount?.isActive ? headAccount.id : resolve.expense(expense.category)
  const chosen = expense.cashAccountId
    ? await db.ledgerAccount.findFirst({ where: { id: expense.cashAccountId, isActive: true }, select: { id: true } })
    : null
  const paidFrom = chosen?.id ?? resolve.mode(expense.paymentMode)
  const desired: Desired = {
    date: bookDay(expense.expenseDate),
    voucherType: 'PAYMENT',
    narration: `${expense.title}${expense.vendor ? ` - ${expense.vendor}` : ''}`,
    reference: expense.referenceNo,
    lines: [
      { accountId: expenseAccount, debitMinor: expense.amountMinor, creditMinor: 0 },
      { accountId: paidFrom, debitMinor: 0, creditMinor: expense.amountMinor },
    ],
  }
  return { expense, desired }
}

async function desiredStoreSale(db: TenantClient, resolve: AccountResolver, saleId: string) {
  const sale = await db.storeSale.findFirst({ where: { id: saleId } })
  if (!sale) return { sale: null, desired: null }
  if (sale.status !== 'COMPLETED' || sale.totalMinor <= 0) return { sale, desired: null }
  if (sale.paymentMode === 'FEE_ACCOUNT') {
    // The money arrives later as a fee receipt against the store invoice and is
    // booked there; only the goods leaving the shelf are booked now.
    if (sale.costMinor <= 0) return { sale, desired: null }
    const desired: Desired = {
      date: bookDay(sale.soldAt),
      voucherType: 'JOURNAL',
      narration: `Store sale ${sale.number}${sale.customerName ? ` to ${sale.customerName}` : ''} added to fees`,
      reference: sale.number,
      lines: [
        { accountId: resolve.system('EXP_STORE_COGS'), debitMinor: sale.costMinor, creditMinor: 0, memo: 'Cost of goods sold' },
        { accountId: resolve.system('STORE_STOCK'), debitMinor: 0, creditMinor: sale.costMinor, memo: 'Cost of goods sold' },
      ],
    }
    return { sale, desired }
  }
  const lines: DraftLine[] = [
    { accountId: resolve.mode(sale.paymentMode), debitMinor: sale.totalMinor, creditMinor: 0 },
    { accountId: resolve.system('STORE_SALES_INCOME'), debitMinor: 0, creditMinor: sale.totalMinor - sale.taxMinor },
  ]
  if (sale.taxMinor > 0) {
    lines.push({ accountId: resolve.system('GST_PAYABLE'), debitMinor: 0, creditMinor: sale.taxMinor })
  }
  if (sale.costMinor > 0) {
    lines.push(
      { accountId: resolve.system('EXP_STORE_COGS'), debitMinor: sale.costMinor, creditMinor: 0, memo: 'Cost of goods sold' },
      { accountId: resolve.system('STORE_STOCK'), debitMinor: 0, creditMinor: sale.costMinor, memo: 'Cost of goods sold' },
    )
  }
  const desired: Desired = {
    date: bookDay(sale.soldAt),
    voucherType: 'RECEIPT',
    narration: `Store sale ${sale.number}${sale.customerName ? ` to ${sale.customerName}` : ''}`,
    reference: sale.number,
    lines,
  }
  return { sale, desired }
}

async function desiredStorePurchase(db: TenantClient, resolve: AccountResolver, purchaseId: string) {
  const purchase = await db.storePurchase.findFirst({ where: { id: purchaseId } })
  if (!purchase || purchase.totalMinor <= 0) return { purchase, desired: null }
  // Bought on credit: the vendor bill raised with it debits store stock.
  if (purchase.paymentMode === 'CREDIT') return { purchase, desired: null }
  const desired: Desired = {
    date: bookDay(purchase.purchaseDate),
    voucherType: 'PAYMENT',
    narration: `Store stock ${purchase.number} from ${purchase.vendorName}${
      purchase.invoiceNo ? ` (bill ${purchase.invoiceNo})` : ''
    }`,
    reference: purchase.number,
    lines: [
      { accountId: resolve.system('STORE_STOCK'), debitMinor: purchase.totalMinor, creditMinor: 0 },
      { accountId: resolve.mode(purchase.paymentMode), debitMinor: 0, creditMinor: purchase.totalMinor },
    ],
  }
  return { purchase, desired }
}

const MONTH_FMT = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/**
 * A paid payslip books the salary earned (gross less loss of pay) as an
 * expense, the net paid out of cash / bank, and anything withheld (PF, TDS,
 * recoveries) as owed until the school pays it over.
 */
async function desiredPayslip(db: TenantClient, resolve: AccountResolver, payslipId: string) {
  const slip = await db.staffPayslip.findFirst({
    where: { id: payslipId },
    include: { staff: { select: { firstName: true, lastName: true, employeeCode: true } } },
  })
  if (!slip) return { slip: null, desired: null }
  const earned = slip.grossMinor - slip.lopMinor
  if (slip.status !== 'PAID' || earned <= 0) return { slip, desired: null }
  const net = Math.max(0, slip.netMinor)
  const withheld = earned - net
  const mode = slip.paymentMode ?? 'BANK_TRANSFER'
  const lines: DraftLine[] = [
    { accountId: resolve.expense('SALARY'), debitMinor: earned, creditMinor: 0 },
  ]
  if (net > 0) lines.push({ accountId: resolve.mode(mode), debitMinor: 0, creditMinor: net })
  if (withheld > 0) {
    lines.push({
      accountId: resolve.system('SALARY_DEDUCTIONS_PAYABLE'),
      debitMinor: 0,
      creditMinor: withheld,
      memo: 'Deductions withheld',
    })
  }
  const month = MONTH_FMT.format(new Date(Date.UTC(slip.periodYear, slip.periodMonth - 1, 1)))
  const desired: Desired = {
    date: bookDay(slip.paidAt ?? slip.updatedAt),
    voucherType: 'PAYMENT',
    narration: `Salary for ${month} - ${slip.staff.firstName} ${slip.staff.lastName} (${slip.staff.employeeCode}) via ${
      mode.replaceAll('_', ' ').toLowerCase()
    }`,
    reference: `PAY-${slip.periodYear}-${String(slip.periodMonth).padStart(2, '0')}-${slip.staff.employeeCode}`,
    lines,
  }
  return { slip, desired }
}

/** Movements that carry their own entry: sales and purchases post through their documents. */
const STANDALONE_MOVEMENTS = ['OPENING', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT'] as const

async function desiredStockMovement(db: TenantClient, resolve: AccountResolver, movementId: string) {
  const m = await db.stockMovement.findFirst({
    where: { id: movementId },
    include: { item: { select: { name: true, variant: true } } },
  })
  if (!m || !(STANDALONE_MOVEMENTS as readonly string[]).includes(m.type)) return { movement: m, desired: null }
  const value = Math.abs(m.quantity) * m.unitCostMinor
  if (value <= 0) return { movement: m, desired: null }
  const label = m.item.variant ? `${m.item.name} (${m.item.variant})` : m.item.name
  const stock = resolve.system('STORE_STOCK')
  const other = m.type === 'OPENING'
    ? resolve.system('OPENING_EQUITY')
    : resolve.system('EXP_STOCK_LOSS')
  const increases = m.quantity > 0
  const desired: Desired = {
    date: bookDay(m.createdAt),
    voucherType: 'JOURNAL',
    narration: `${m.type === 'OPENING' ? 'Opening stock' : 'Stock adjustment'}: ${Math.abs(m.quantity)} × ${label}${
      m.reason && m.type !== 'OPENING' ? ` - ${m.reason}` : ''
    }`,
    reference: null,
    lines: [
      { accountId: stock, debitMinor: increases ? value : 0, creditMinor: increases ? 0 : value },
      { accountId: other, debitMinor: increases ? 0 : value, creditMinor: increases ? value : 0 },
    ],
  }
  return { movement: m, desired }
}

async function settingsFor(db: TenantClient, tenantId: string) {
  // Creating the row enrols the school in the daily catch-up job.
  const row = await db.ledgerSettings.upsert({ where: { tenantId }, create: { tenantId }, update: {} })
  return { autoPostFees: row.autoPostFees, autoPostExpenses: row.autoPostExpenses, autoPostStore: row.autoPostStore }
}

type Ctx = { db: TenantClient; resolve: AccountResolver; tenantId: string }

async function makeCtx(tenantId: string): Promise<Ctx> {
  const db = tenantDb(tenantId)
  return { db, tenantId, resolve: await loadResolver(tenantId, db) }
}

async function syncPaymentWith(c: Ctx, paymentId: string) {
  const { payment, desired } = await desiredPayment(c.db, c.resolve, paymentId)
  const voided = payment ? bookDay(payment.failedAt ?? payment.updatedAt) : bookDay(new Date())
  const outcomes = [await reconcileSource(c.db, c.tenantId, 'FEE_PAYMENT', paymentId, desired, voided)]
  const refunds = await c.db.feeRefund.findMany({ where: { paymentId }, select: { id: true } })
  for (const r of refunds) outcomes.push(await syncRefundWith(c, r.id))
  return outcomes
}

async function syncRefundWith(c: Ctx, refundId: string) {
  const { desired } = await desiredRefund(c.db, c.resolve, refundId)
  return reconcileSource(c.db, c.tenantId, 'FEE_REFUND', refundId, desired, bookDay(new Date()))
}

type ExpenseWriteClient = WriteClient & Pick<TenantClient, 'schoolExpense' | 'ledgerAccount'>

/**
 * Posts a new expense inside the caller's transaction (expense approval), so
 * the expense and its entry commit or fail together. Uses the key the sync
 * would use for a first version, so the nightly job sees it as up to date.
 */
export async function postExpenseInTransaction(
  tx: ExpenseWriteClient,
  tenantId: string,
  resolve: AccountResolver,
  expenseId: string,
  actor: { id: string; label: string },
) {
  const { desired } = await desiredExpense(tx, resolve, expenseId)
  if (!desired) throw new Error('This expense has nothing to post')
  return writeJournalEntry(tx, tenantId, {
    ...desired,
    sourceType: 'EXPENSE',
    sourceId: expenseId,
    postingKey: `EXPENSE:${expenseId}:v1`,
    createdById: actor.id,
    createdByLabel: actor.label,
    preApproved: true,
  })
}

/**
 * Reverses an expense's active entry inside the caller's transaction, dated
 * `on` (never before the original), as the sync would after a deletion.
 */
export async function reverseExpenseInTransaction(
  tx: WriteClient,
  tenantId: string,
  expenseId: string,
  on: Date,
  actor: { id: string; label: string },
) {
  const active = await tx.journalEntry.findFirst({
    where: { sourceType: 'EXPENSE', sourceId: expenseId, isReversal: false, reversedAt: null },
    include: { lines: true },
    orderBy: { createdAt: 'desc' },
  })
  if (!active) return null
  const claimed = await tx.journalEntry.updateMany({ where: { id: active.id, reversedAt: null }, data: { reversedAt: new Date() } })
  if (claimed.count !== 1) throw new Error('This entry is already being reversed')
  return writeJournalEntry(tx, tenantId, {
    date: on < active.date ? active.date : on,
    voucherType: active.voucherType,
    narration: `Reversal of ${active.number} (approved expense reversed)`,
    reference: active.reference,
    lines: reverseLines(active.lines),
    sourceType: 'EXPENSE',
    sourceId: expenseId,
    postingKey: `EXPENSE:${expenseId}:rev:${active.id}`,
    isReversal: true,
    reversalOfId: active.id,
    createdById: actor.id,
    createdByLabel: actor.label,
  })
}

async function syncExpenseWith(c: Ctx, expenseId: string) {
  const { expense, desired } = await desiredExpense(c.db, c.resolve, expenseId)
  const voided = bookDay(expense?.deletedAt ?? new Date())
  return reconcileSource(c.db, c.tenantId, 'EXPENSE', expenseId, desired, voided)
}

async function syncPayslipWith(c: Ctx, payslipId: string) {
  const { desired } = await desiredPayslip(c.db, c.resolve, payslipId)
  return reconcileSource(c.db, c.tenantId, 'PAYROLL', payslipId, desired, bookDay(new Date()))
}

async function syncStoreSaleWith(c: Ctx, saleId: string) {
  const { sale, desired } = await desiredStoreSale(c.db, c.resolve, saleId)
  const voided = bookDay(sale?.voidedAt ?? new Date())
  return reconcileSource(c.db, c.tenantId, 'STORE_SALE', saleId, desired, voided)
}

async function syncStorePurchaseWith(c: Ctx, purchaseId: string) {
  const { desired } = await desiredStorePurchase(c.db, c.resolve, purchaseId)
  return reconcileSource(c.db, c.tenantId, 'STORE_PURCHASE', purchaseId, desired, bookDay(new Date()))
}

async function syncStockMovementWith(c: Ctx, movementId: string) {
  const { desired } = await desiredStockMovement(c.db, c.resolve, movementId)
  return reconcileSource(c.db, c.tenantId, 'STORE_STOCK', movementId, desired, bookDay(new Date()))
}

function storeHook(kind: string, run: (c: Ctx) => Promise<unknown>) {
  return async (tenantId: string, id: string) => {
    try {
      const c = await makeCtx(tenantId)
      if (!(await settingsFor(c.db, tenantId)).autoPostStore) return
      await run(c)
    } catch (err) {
      console.error(`[ledger] store ${kind} posting failed`, id, err)
    }
  }
}

/** Posts / reverses one store bill. Never throws. */
export const syncStoreSaleLedger = (tenantId: string, saleId: string) =>
  storeHook('sale', (c) => syncStoreSaleWith(c, saleId))(tenantId, saleId)

/** Posts one stock receipt. Never throws. */
export const syncStorePurchaseLedger = (tenantId: string, purchaseId: string) =>
  storeHook('purchase', (c) => syncStorePurchaseWith(c, purchaseId))(tenantId, purchaseId)

/** Posts an opening-stock or adjustment movement. Never throws. */
export const syncStockMovementLedger = (tenantId: string, movementId: string) =>
  storeHook('movement', (c) => syncStockMovementWith(c, movementId))(tenantId, movementId)

/** Posts / re-posts one fee payment and its refunds. Never throws. */
export async function syncPaymentLedger(tenantId: string, paymentId: string) {
  try {
    const c = await makeCtx(tenantId)
    if (!(await settingsFor(c.db, tenantId)).autoPostFees) return
    await syncPaymentWith(c, paymentId)
  } catch (err) {
    console.error('[ledger] payment posting failed', paymentId, err)
  }
}

/** Posts / reverses one school expense. Never throws. */
export async function syncExpenseLedger(tenantId: string, expenseId: string) {
  try {
    const c = await makeCtx(tenantId)
    if (!(await settingsFor(c.db, tenantId)).autoPostExpenses) return
    await syncExpenseWith(c, expenseId)
  } catch (err) {
    console.error('[ledger] expense posting failed', expenseId, err)
  }
}

/** Posts the salary payment for one paid payslip. Never throws. */
export async function syncPayslipLedger(tenantId: string, payslipId: string) {
  try {
    const c = await makeCtx(tenantId)
    if (!(await settingsFor(c.db, tenantId)).autoPostExpenses) return
    await syncPayslipWith(c, payslipId)
  } catch (err) {
    console.error('[ledger] payslip posting failed', payslipId, err)
  }
}

export type LedgerSyncSummary = {
  payments: number
  expenses: number
  payslips: number
  store: number
  posted: number
  reposted: number
  reversed: number
  failed: number
}

/**
 * Catches the books up with every fee payment, refund and expense changed
 * since the last run (or all of them when `full`). Used by the backfill button
 * and the daily job, so a missed fire-and-forget hook heals itself.
 */
export async function syncLedgerForTenant(tenantId: string, options: { full?: boolean } = {}) {
  const c = await makeCtx(tenantId)
  const settings = await c.db.ledgerSettings.findUnique({ where: { tenantId } })
  const autoFees = settings?.autoPostFees ?? true
  const autoExpenses = settings?.autoPostExpenses ?? true
  const autoStore = settings?.autoPostStore ?? true
  const since = options.full ? null : settings?.lastSyncedAt ?? null
  const startedAt = new Date()
  const summary: LedgerSyncSummary = { payments: 0, expenses: 0, payslips: 0, store: 0, posted: 0, reposted: 0, reversed: 0, failed: 0 }
  const count = (o: SyncOutcome) => {
    if (o === 'posted') summary.posted++
    else if (o === 'reposted') summary.reposted++
    else if (o === 'reversed') summary.reversed++
  }

  if (autoFees) {
    const payments = await c.db.feePayment.findMany({
      where: since
        ? { updatedAt: { gte: since } }
        : { status: { in: ['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED', 'REVERSED', 'FAILED'] } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    })
    const refundPayments = since
      ? await c.db.feeRefund.findMany({
          where: { OR: [{ createdAt: { gte: since } }, { completedAt: { gte: since } }] },
          select: { paymentId: true },
        })
      : []
    const ids = [...new Set([...payments.map((p) => p.id), ...refundPayments.map((r) => r.paymentId)])]
    for (const id of ids) {
      summary.payments++
      try {
        for (const o of await syncPaymentWith(c, id)) count(o)
      } catch (err) {
        summary.failed++
        console.error('[ledger] backfill payment failed', id, err)
      }
    }
  }

  if (autoExpenses) {
    const expenses = await c.db.schoolExpense.findMany({
      where: since ? { updatedAt: { gte: since } } : {},
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    })
    for (const e of expenses) {
      summary.expenses++
      try {
        count(await syncExpenseWith(c, e.id))
      } catch (err) {
        summary.failed++
        console.error('[ledger] backfill expense failed', e.id, err)
      }
    }

    const posted = await c.db.journalEntry.findMany({
      where: { sourceType: 'PAYROLL', isReversal: false, reversedAt: null },
      select: { sourceId: true },
    })
    const postedIds = new Set(posted.map((p) => p.sourceId))
    const payslips = await c.db.staffPayslip.findMany({
      where: since
        ? { OR: [{ updatedAt: { gte: since } }, { status: 'PAID' }] }
        : { status: 'PAID' },
      select: { id: true, status: true, updatedAt: true },
      orderBy: { createdAt: 'asc' },
    })
    // Paid payslips that predate payroll posting have no entry yet; pick them up too.
    const due = payslips.filter((p) => !since || p.updatedAt >= since || !postedIds.has(p.id))
    for (const p of due) {
      summary.payslips++
      try {
        count(await syncPayslipWith(c, p.id))
      } catch (err) {
        summary.failed++
        console.error('[ledger] backfill payslip failed', p.id, err)
      }
    }
  }

  if (autoStore) {
    const changed = since ? { updatedAt: { gte: since } } : {}
    const [sales, purchases, movements] = await Promise.all([
      c.db.storeSale.findMany({ where: changed, select: { id: true }, orderBy: { createdAt: 'asc' } }),
      c.db.storePurchase.findMany({ where: changed, select: { id: true }, orderBy: { createdAt: 'asc' } }),
      c.db.stockMovement.findMany({
        where: { ...changed, type: { in: [...STANDALONE_MOVEMENTS] } },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      }),
    ])
    const jobs: Array<[string, () => Promise<SyncOutcome>]> = [
      ...sales.map((s) => [s.id, () => syncStoreSaleWith(c, s.id)] as [string, () => Promise<SyncOutcome>]),
      ...purchases.map((p) => [p.id, () => syncStorePurchaseWith(c, p.id)] as [string, () => Promise<SyncOutcome>]),
      ...movements.map((m) => [m.id, () => syncStockMovementWith(c, m.id)] as [string, () => Promise<SyncOutcome>]),
    ]
    for (const [id, run] of jobs) {
      summary.store++
      try {
        count(await run())
      } catch (err) {
        summary.failed++
        console.error('[ledger] backfill store document failed', id, err)
      }
    }
  }

  await c.db.ledgerSettings.upsert({
    where: { tenantId },
    create: { tenantId, lastSyncedAt: startedAt },
    update: { lastSyncedAt: startedAt },
  })
  return summary
}

/** Daily catch-up across schools that have opened their books. */
export async function runLedgerCatchUp() {
  const { prisma } = await import('@/server/db/prisma')
  const rows = await prisma.ledgerSettings.findMany({
    where: { OR: [{ autoPostFees: true }, { autoPostExpenses: true }, { autoPostStore: true }] },
    select: { tenantId: true },
  })
  let schools = 0
  let failed = 0
  for (const row of rows) {
    try {
      await syncLedgerForTenant(row.tenantId)
      schools++
    } catch (err) {
      failed++
      console.error('[ledger] catch-up failed', row.tenantId, err)
    }
  }
  return { schools, failed }
}
