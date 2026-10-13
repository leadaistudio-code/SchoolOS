import { z } from 'zod'
import type { AppContext } from '@/server/context'
import type { TenantClient } from '@/server/db/tenant-client'
import { ApiException, badRequest, notFound } from '@/server/api/response'
import { assertStudentAccess } from '@/server/scope'
import { schoolToday } from '@/lib/periods'
import { getAccountingFlags } from './service'
import { fiscalYearStartingIn, recentFiscalYears, type FiscalYearSpan } from './fiscal-year'
import {
  LEDGER_ENTRY_KINDS,
  buildStudentLedgerEntries,
  reconcileStudentLedger,
  viewStudentLedger,
  type StudentFeeSnapshot,
} from './student-ledger'

/** All years, the current year and the three before it. */
export const LEDGER_FISCAL_YEAR_COUNT = 4

export const studentLedgerQuerySchema = z.object({
  fy: z
    .string()
    .trim()
    .regex(/^(all|\d{4}(-\d{2})?)$/, 'Choose a financial year')
    .default('all'),
  kind: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').filter(Boolean) : []))
    .pipe(z.array(z.enum(LEDGER_ENTRY_KINDS))),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
})

export type StudentLedgerQuery = z.infer<typeof studentLedgerQuerySchema>

function resolveFiscalYear(fy: string, startMonth: number): FiscalYearSpan | null {
  if (fy === 'all') return null
  const span = fiscalYearStartingIn(Number(fy.slice(0, 4)), startMonth)
  if (span.label !== fy) throw badRequest('That financial year does not match the school calendar')
  return span
}

/** Everything the projection needs, read through the tenant-scoped client. */
export async function loadStudentFeeSnapshot(
  db: Pick<TenantClient, 'feeInvoice' | 'feePayment' | 'feeRefund' | 'studentFeeCredit' | 'feeAdjustment'>,
  studentId: string,
): Promise<StudentFeeSnapshot> {
  const [invoices, payments, credits, adjustments] = await Promise.all([
    db.feeInvoice.findMany({
      where: { studentId },
      orderBy: [{ issuedOn: 'asc' }, { number: 'asc' }],
      select: {
        id: true,
        number: true,
        title: true,
        status: true,
        cancelledAt: true,
        issuedOn: true,
        dueOn: true,
        subtotalMinor: true,
        discountMinor: true,
        taxMinor: true,
        lateFeeMinor: true,
        totalMinor: true,
        paidMinor: true,
        balanceMinor: true,
        lines: {
          orderBy: { id: 'asc' },
          select: {
            feeHeadId: true,
            label: true,
            amountMinor: true,
            discountMinor: true,
            feeHead: { select: { name: true } },
          },
        },
      },
    }),
    db.feePayment.findMany({
      where: { studentId },
      orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        status: true,
        mode: true,
        amountMinor: true,
        paidAt: true,
        createdAt: true,
        updatedAt: true,
        reference: true,
        receipt: { select: { number: true } },
        allocations: { select: { invoiceId: true, amountMinor: true } },
      },
    }),
    db.studentFeeCredit.findMany({
      where: { studentId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        type: true,
        amountMinor: true,
        paymentId: true,
        invoiceId: true,
        reference: true,
        notes: true,
        createdAt: true,
      },
    }),
    db.feeAdjustment.findMany({
      where: { studentId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, type: true, invoiceId: true, amountMinor: true, reason: true, createdAt: true },
    }),
  ])

  const refunds = payments.length
    ? await db.feeRefund.findMany({
        where: { paymentId: { in: payments.map((p) => p.id) } },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          paymentId: true,
          status: true,
          amountMinor: true,
          reason: true,
          createdAt: true,
          completedAt: true,
          allocations: { select: { invoiceId: true, amountMinor: true } },
        },
      })
    : []

  return {
    invoices: invoices.map(({ lines, ...invoice }) => ({
      ...invoice,
      lines: lines.map(({ feeHead, ...line }) => ({ ...line, feeHeadName: feeHead?.name ?? null })),
    })),
    payments: payments.map(({ receipt, ...p }) => ({ ...p, receiptNumber: receipt?.number ?? null })),
    refunds,
    credits,
    adjustments,
  }
}

/**
 * Who may open a student's statement. Staff need `fees.view` and row access;
 * parents and students reach only their own children (or themselves) through
 * `assertStudentAccess`. Diagnostics are for finance staff only.
 */
async function authorise(ctx: AppContext, studentId: string) {
  ctx.require('fees.view')
  const flags = await getAccountingFlags(ctx.db)
  if (!flags.studentLedger) {
    throw new ApiException(403, 'FEATURE_DISABLED', 'The student fee ledger is not enabled for this school')
  }
  await assertStudentAccess(ctx, studentId)
  const student = await ctx.db.student.findFirst({
    where: { id: studentId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true, admissionNo: true },
  })
  if (!student) throw notFound('Student')
  return { flags, student }
}

export function canSeeLedgerDiagnostics(ctx: Pick<AppContext, 'canAny'>): boolean {
  return ctx.canAny('fees.accounts', 'accounts.view')
}

export async function getStudentLedger(ctx: AppContext, studentId: string, query: StudentLedgerQuery) {
  const { flags, student } = await authorise(ctx, studentId)
  const fiscalYear = resolveFiscalYear(query.fy, flags.fiscalYearStartMonth)
  const snapshot = await loadStudentFeeSnapshot(ctx.db, studentId)
  const entries = buildStudentLedgerEntries(snapshot)
  const view = viewStudentLedger(entries, {
    fiscalYear,
    kinds: query.kind,
    page: query.page,
    pageSize: query.pageSize,
  })
  const reconciliation = reconcileStudentLedger(snapshot, entries)
  const diagnostics = canSeeLedgerDiagnostics(ctx)

  return {
    student: {
      id: student.id,
      name: `${student.firstName} ${student.lastName}`.trim(),
      admissionNo: student.admissionNo,
    },
    fiscalYears: recentFiscalYears(schoolToday(), LEDGER_FISCAL_YEAR_COUNT, flags.fiscalYearStartMonth),
    ...view,
    page: query.page,
    pageSize: query.pageSize,
    summary: {
      cardOutstandingMinor: reconciliation.cardOutstandingMinor,
      advanceMinor: reconciliation.advanceMinor,
      netOutstandingMinor: reconciliation.ledgerClosingMinor,
      reconciled: reconciliation.ok,
    },
    reconciliation: diagnostics ? reconciliation : null,
  }
}

export async function getStudentLedgerReconciliation(ctx: AppContext, studentId: string) {
  await authorise(ctx, studentId)
  if (!canSeeLedgerDiagnostics(ctx)) {
    throw new ApiException(403, 'FORBIDDEN', 'Ledger diagnostics are limited to finance staff')
  }
  const snapshot = await loadStudentFeeSnapshot(ctx.db, studentId)
  return reconcileStudentLedger(snapshot)
}
