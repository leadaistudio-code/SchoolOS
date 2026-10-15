/**
 * Statement of account for one student, projected read-only from the fee
 * module. Nothing here writes; the fee tables stay the source of truth.
 *
 * Sign convention: debit raises what the student owes, credit lowers it. The
 * all-years closing balance therefore equals the open invoice balances less
 * any advance held, which `reconcileStudentLedger` proves row by row.
 *
 * How each fee event maps, and why it cannot be counted twice:
 * - Invoice: demand (lines + tax) Dr, concession Cr, late fee Dr. The three
 *   add up to the stored invoice total. Cancelled and draft invoices are out.
 * - Receipt: Cr for what was allocated to counted invoices plus the advance
 *   parked from the same payment. `payment.amountMinor` itself is never
 *   used, so an allocation and its advance remainder are each counted once.
 * - Refund (completed only): Dr for the refund amount. Its invoice share
 *   reopens invoices; its advance share is the matching REFUND credit entry,
 *   which is therefore not posted again.
 * - Reversed payment: the original receipt stays (it happened) and a
 *   reversal Dr undoes the allocations and parked advance.
 * - Counter discounts and concession recalculations rewrite the invoice in
 *   place without a dated event, so concessions are shown on the invoice
 *   date and late fees on the due date, flagged as approximate.
 */

import { toIsoDay, type FiscalYearSpan } from './fiscal-year'

const IST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' })

/** A `@db.Date` keeps its day; an instant becomes the school's (IST) day. */
export function schoolDayOf(value: Date): string {
  const utcMidnight =
    value.getUTCHours() === 0 &&
    value.getUTCMinutes() === 0 &&
    value.getUTCSeconds() === 0 &&
    value.getUTCMilliseconds() === 0
  return utcMidnight ? toIsoDay(value) : IST.format(value)
}

export const LEDGER_ENTRY_KINDS = [
  'DEMAND',
  'LATE_FEE',
  'CONCESSION',
  'RECEIPT',
  'REFUND',
  'REVERSAL',
  'ADVANCE',
] as const
export type LedgerEntryKind = (typeof LEDGER_ENTRY_KINDS)[number]

const KIND_ORDER: Record<LedgerEntryKind, number> = {
  DEMAND: 0,
  LATE_FEE: 1,
  CONCESSION: 2,
  RECEIPT: 3,
  ADVANCE: 4,
  REFUND: 5,
  REVERSAL: 6,
}

export const VOUCHER_TYPE_LABEL: Record<LedgerEntryKind, string> = {
  DEMAND: 'Fee demand',
  LATE_FEE: 'Late fee',
  CONCESSION: 'Concession / waiver',
  RECEIPT: 'Receipt',
  ADVANCE: 'Advance adjustment',
  REFUND: 'Refund',
  REVERSAL: 'Payment reversal',
}

const EXCLUDED_INVOICE_STATUSES = new Set(['CANCELLED', 'DRAFT'])
const RECEIVED_PAYMENT_STATUSES = new Set(['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED', 'REVERSED'])
const ADVANCE_PLUS = new Set(['CREDIT', 'ADJUSTMENT'])

export type InvoiceInput = {
  id: string
  number: string
  title: string
  status: string
  cancelledAt: Date | null
  issuedOn: Date
  dueOn: Date
  subtotalMinor: number
  discountMinor: number
  taxMinor: number
  lateFeeMinor: number
  totalMinor: number
  paidMinor: number
  balanceMinor: number
  lines: {
    feeHeadId: string | null
    feeHeadName: string | null
    label: string
    amountMinor: number
    discountMinor: number
  }[]
}

export type PaymentInput = {
  id: string
  status: string
  mode: string
  amountMinor: number
  paidAt: Date | null
  createdAt: Date
  updatedAt: Date
  receiptNumber: string | null
  reference: string | null
  allocations: { invoiceId: string; amountMinor: number }[]
}

export type RefundInput = {
  id: string
  paymentId: string
  status: string
  amountMinor: number
  reason: string
  createdAt: Date
  completedAt: Date | null
  allocations: { invoiceId: string; amountMinor: number }[]
}

export type CreditInput = {
  id: string
  type: string
  amountMinor: number
  paymentId: string | null
  invoiceId: string | null
  reference: string | null
  notes: string | null
  createdAt: Date
}

export type AdjustmentInput = {
  id: string
  type: string
  invoiceId: string | null
  amountMinor: number
  reason: string
  createdAt: Date
}

export type StudentFeeSnapshot = {
  invoices: InvoiceInput[]
  payments: PaymentInput[]
  refunds: RefundInput[]
  credits: CreditInput[]
  adjustments: AdjustmentInput[]
}

export type LedgerDetail = {
  label: string
  amountMinor: number
  feeHeadId?: string | null
  invoiceNumber?: string
}

export type LedgerEntry = {
  id: string
  date: string
  kind: LedgerEntryKind
  particulars: string
  voucherType: string
  voucherNo: string
  debitMinor: number
  creditMinor: number
  source: { type: 'FeeInvoice' | 'FeePayment' | 'FeeRefund' | 'StudentFeeCredit'; id: string }
  details: LedgerDetail[]
  approximateDate?: boolean
}

export type LedgerRow = LedgerEntry & { balanceMinor: number; side: 'Dr' | 'Cr' | '' }

export function balanceSide(balanceMinor: number): 'Dr' | 'Cr' | '' {
  return balanceMinor > 0 ? 'Dr' : balanceMinor < 0 ? 'Cr' : ''
}

export function isCountedInvoice(invoice: Pick<InvoiceInput, 'status' | 'cancelledAt'>): boolean {
  return !EXCLUDED_INVOICE_STATUSES.has(invoice.status) && invoice.cancelledAt === null
}

/** Signed advance (credit) balance held for the student. */
export function advanceBalanceOf(credits: Pick<CreditInput, 'type' | 'amountMinor'>[]): number {
  return credits.reduce((sum, c) => sum + (ADVANCE_PLUS.has(c.type) ? c.amountMinor : -c.amountMinor), 0)
}

function compareEntries(a: LedgerEntry, b: LedgerEntry): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  if (a.kind !== b.kind) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
  if (a.voucherNo !== b.voucherNo) return a.voucherNo < b.voucherNo ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** Every ledger entry for the student, oldest first. Pure and deterministic. */
export function buildStudentLedgerEntries(snapshot: StudentFeeSnapshot): LedgerEntry[] {
  const entries: LedgerEntry[] = []
  const counted = new Map(snapshot.invoices.filter(isCountedInvoice).map((i) => [i.id, i]))
  const numberOf = (invoiceId: string) => counted.get(invoiceId)?.number ?? invoiceId

  for (const invoice of counted.values()) {
    const issued = toIsoDay(invoice.issuedOn)
    const demandMinor = invoice.subtotalMinor + invoice.taxMinor
    const lineDetails: LedgerDetail[] = invoice.lines.map((line) => ({
      label: line.feeHeadName ?? line.label,
      amountMinor: line.amountMinor,
      feeHeadId: line.feeHeadId,
    }))
    if (invoice.taxMinor !== 0) lineDetails.push({ label: 'Tax', amountMinor: invoice.taxMinor, feeHeadId: null })
    if (demandMinor !== 0) {
      entries.push({
        id: `inv:${invoice.id}:demand`,
        date: issued,
        kind: 'DEMAND',
        particulars: invoice.title,
        voucherType: VOUCHER_TYPE_LABEL.DEMAND,
        voucherNo: invoice.number,
        debitMinor: demandMinor,
        creditMinor: 0,
        source: { type: 'FeeInvoice', id: invoice.id },
        details: lineDetails,
      })
    }

    if (invoice.discountMinor !== 0) {
      const lineDiscount = invoice.lines.reduce((s, l) => s + l.discountMinor, 0)
      const details: LedgerDetail[] = invoice.lines
        .filter((l) => l.discountMinor !== 0)
        .map((l) => ({ label: l.feeHeadName ?? l.label, amountMinor: l.discountMinor, feeHeadId: l.feeHeadId }))
      if (lineDiscount !== invoice.discountMinor) {
        details.push({ label: 'Invoice-level discount', amountMinor: invoice.discountMinor - lineDiscount, feeHeadId: null })
      }
      entries.push({
        id: `inv:${invoice.id}:concession`,
        date: issued,
        kind: 'CONCESSION',
        particulars: `Concession on ${invoice.title}`,
        voucherType: VOUCHER_TYPE_LABEL.CONCESSION,
        voucherNo: invoice.number,
        debitMinor: 0,
        creditMinor: invoice.discountMinor,
        source: { type: 'FeeInvoice', id: invoice.id },
        details,
        approximateDate: true,
      })
    }

    if (invoice.lateFeeMinor !== 0) {
      entries.push({
        id: `inv:${invoice.id}:late`,
        date: toIsoDay(invoice.dueOn),
        kind: 'LATE_FEE',
        particulars: `Late fee on ${invoice.title}`,
        voucherType: VOUCHER_TYPE_LABEL.LATE_FEE,
        voucherNo: invoice.number,
        debitMinor: invoice.lateFeeMinor,
        creditMinor: 0,
        source: { type: 'FeeInvoice', id: invoice.id },
        details: [{ label: 'Late fee', amountMinor: invoice.lateFeeMinor, invoiceNumber: invoice.number }],
        approximateDate: true,
      })
    }
  }

  const creditsByPayment = new Map<string, CreditInput[]>()
  for (const credit of snapshot.credits) {
    if (!credit.paymentId) continue
    const list = creditsByPayment.get(credit.paymentId) ?? []
    list.push(credit)
    creditsByPayment.set(credit.paymentId, list)
  }
  const receivedPaymentIds = new Set<string>()

  for (const payment of snapshot.payments) {
    if (!RECEIVED_PAYMENT_STATUSES.has(payment.status)) continue
    receivedPaymentIds.add(payment.id)
    const allocations = payment.allocations.filter((a) => counted.has(a.invoiceId))
    const allocatedMinor = allocations.reduce((s, a) => s + a.amountMinor, 0)
    const linkedCredits = creditsByPayment.get(payment.id) ?? []
    const parkedMinor = linkedCredits.filter((c) => c.type === 'CREDIT').reduce((s, c) => s + c.amountMinor, 0)
    const receivedMinor = allocatedMinor + parkedMinor
    const voucherNo = payment.receiptNumber ?? payment.id
    const mode = payment.mode.toLowerCase().replaceAll('_', ' ')

    if (receivedMinor !== 0) {
      entries.push({
        id: `pay:${payment.id}`,
        date: schoolDayOf(payment.paidAt ?? payment.createdAt),
        kind: 'RECEIPT',
        particulars: `Fee received (${mode})${payment.reference ? ` · ${payment.reference}` : ''}`,
        voucherType: VOUCHER_TYPE_LABEL.RECEIPT,
        voucherNo,
        debitMinor: 0,
        creditMinor: receivedMinor,
        source: { type: 'FeePayment', id: payment.id },
        details: [
          ...allocations.map((a) => ({
            label: `Applied to ${numberOf(a.invoiceId)}`,
            amountMinor: a.amountMinor,
            invoiceNumber: numberOf(a.invoiceId),
          })),
          ...(parkedMinor ? [{ label: 'Held as advance', amountMinor: parkedMinor }] : []),
        ],
      })
    }

    if (payment.status === 'REVERSED') {
      const reversedAdvance = linkedCredits.filter((c) => c.type === 'REVERSAL').reduce((s, c) => s + c.amountMinor, 0)
      const reversedMinor = allocatedMinor + reversedAdvance
      const marker = `Payment ${payment.id} reversed`
      const reversalDates = [
        ...snapshot.adjustments.filter((a) => a.type === 'REVERSAL' && a.reason.startsWith(marker)).map((a) => a.createdAt),
        ...linkedCredits.filter((c) => c.type === 'REVERSAL').map((c) => c.createdAt),
      ].sort((a, b) => a.getTime() - b.getTime())
      if (reversedMinor !== 0) {
        entries.push({
          id: `pay:${payment.id}:reversal`,
          date: schoolDayOf(reversalDates[0] ?? payment.updatedAt),
          kind: 'REVERSAL',
          particulars: `Receipt ${voucherNo} reversed`,
          voucherType: VOUCHER_TYPE_LABEL.REVERSAL,
          voucherNo,
          debitMinor: reversedMinor,
          creditMinor: 0,
          source: { type: 'FeePayment', id: payment.id },
          details: [
            ...allocations.map((a) => ({
              label: `Reopened ${numberOf(a.invoiceId)}`,
              amountMinor: a.amountMinor,
              invoiceNumber: numberOf(a.invoiceId),
            })),
            ...(reversedAdvance ? [{ label: 'Advance withdrawn', amountMinor: reversedAdvance }] : []),
          ],
          approximateDate: reversalDates.length === 0,
        })
      }
    }
  }

  for (const refund of snapshot.refunds) {
    if (refund.status !== 'SUCCESS' || !receivedPaymentIds.has(refund.paymentId)) continue
    const allocations = refund.allocations.filter((a) => counted.has(a.invoiceId))
    const fromInvoices = allocations.reduce((s, a) => s + a.amountMinor, 0)
    const payment = snapshot.payments.find((p) => p.id === refund.paymentId)
    entries.push({
      id: `ref:${refund.id}`,
      date: schoolDayOf(refund.completedAt ?? refund.createdAt),
      kind: 'REFUND',
      particulars: `Refund${refund.reason ? `: ${refund.reason}` : ''}`,
      voucherType: VOUCHER_TYPE_LABEL.REFUND,
      voucherNo: payment?.receiptNumber ?? refund.id,
      debitMinor: refund.amountMinor,
      creditMinor: 0,
      source: { type: 'FeeRefund', id: refund.id },
      details: [
        ...allocations.map((a) => ({
          label: `Reopened ${numberOf(a.invoiceId)}`,
          amountMinor: a.amountMinor,
          invoiceNumber: numberOf(a.invoiceId),
        })),
        ...(refund.amountMinor - fromInvoices
          ? [{ label: 'Paid out of advance', amountMinor: refund.amountMinor - fromInvoices }]
          : []),
      ],
    })
  }

  // Advance entries not already carried by a receipt, refund or reversal above.
  for (const credit of snapshot.credits) {
    const viaPayment = credit.paymentId !== null && receivedPaymentIds.has(credit.paymentId)
    if (viaPayment && (credit.type === 'CREDIT' || credit.type === 'REFUND' || credit.type === 'REVERSAL')) continue
    if (credit.type === 'APPLIED') continue
    const plus = ADVANCE_PLUS.has(credit.type)
    entries.push({
      id: `cr:${credit.id}`,
      date: schoolDayOf(credit.createdAt),
      kind: 'ADVANCE',
      particulars: credit.notes?.trim() || (plus ? 'Advance credit' : 'Advance withdrawn'),
      voucherType: VOUCHER_TYPE_LABEL.ADVANCE,
      voucherNo: credit.reference ?? credit.id,
      debitMinor: plus ? 0 : credit.amountMinor,
      creditMinor: plus ? credit.amountMinor : 0,
      source: { type: 'StudentFeeCredit', id: credit.id },
      details: [{ label: credit.type.toLowerCase(), amountMinor: credit.amountMinor }],
    })
  }

  return entries.sort(compareEntries)
}

export type LedgerTotals = {
  debitMinor: number
  creditMinor: number
  byKind: Record<LedgerEntryKind, { debitMinor: number; creditMinor: number; count: number }>
}

export type FeeHeadSummary = {
  feeHeadId: string | null
  name: string
  demandMinor: number
  concessionMinor: number
  netMinor: number
}

export type StudentLedgerView = {
  fiscalYear: FiscalYearSpan | null
  openingMinor: number
  closingMinor: number
  closingSide: 'Dr' | 'Cr' | ''
  totals: LedgerTotals
  byFeeHead: FeeHeadSummary[]
  rows: LedgerRow[]
  totalRows: number
}

function emptyByKind(): LedgerTotals['byKind'] {
  return Object.fromEntries(
    LEDGER_ENTRY_KINDS.map((k) => [k, { debitMinor: 0, creditMinor: 0, count: 0 }]),
  ) as LedgerTotals['byKind']
}

export type YearWiseRow = {
  label: string
  startsOn: string | null
  endsOn: string
  /** Balance brought forward from earlier years (Dr positive). */
  openingMinor: number
  debitMinor: number
  creditMinor: number
  closingMinor: number
  closingSide: 'Dr' | 'Cr' | ''
}

/**
 * Year-wise outstanding: one row per financial year (oldest first), each
 * opening on the previous year's closing. Anything dated before the oldest
 * year listed is carried into its opening as "Earlier years" B/F, so the last
 * closing always equals the cumulative balance up to its end date.
 */
export function yearWiseLedger(entries: LedgerEntry[], years: readonly FiscalYearSpan[]): YearWiseRow[] {
  const spans = [...years].sort((a, b) => (a.startsOn < b.startsOn ? -1 : 1))
  if (spans.length === 0) return []
  let running = 0
  for (const e of entries) if (e.date < spans[0]!.startsOn) running += e.debitMinor - e.creditMinor
  return spans.map((span) => {
    const opening = running
    let debit = 0
    let credit = 0
    for (const e of entries) {
      if (e.date >= span.startsOn && e.date <= span.endsOn) {
        debit += e.debitMinor
        credit += e.creditMinor
      }
    }
    running = opening + debit - credit
    return {
      label: span.label,
      startsOn: span.startsOn,
      endsOn: span.endsOn,
      openingMinor: opening,
      debitMinor: debit,
      creditMinor: credit,
      closingMinor: running,
      closingSide: balanceSide(running),
    }
  })
}

/**
 * One period of the statement. `fiscalYear` null means all years from the
 * first entry, opening at zero. Running balances are computed over the full
 * period before filtering and paging, so a page never restarts the balance.
 */
export function viewStudentLedger(
  entries: LedgerEntry[],
  options: {
    fiscalYear: FiscalYearSpan | null
    kinds?: readonly LedgerEntryKind[]
    page?: number
    pageSize?: number
  },
): StudentLedgerView {
  const span = options.fiscalYear
  let opening = 0
  const inPeriod: LedgerEntry[] = []
  for (const entry of entries) {
    if (span && entry.date < span.startsOn) opening += entry.debitMinor - entry.creditMinor
    else if (!span || entry.date <= span.endsOn) inPeriod.push(entry)
  }

  let running = opening
  const totals: LedgerTotals = { debitMinor: 0, creditMinor: 0, byKind: emptyByKind() }
  const heads = new Map<string, FeeHeadSummary>()
  const rows: LedgerRow[] = inPeriod.map((entry) => {
    running += entry.debitMinor - entry.creditMinor
    totals.debitMinor += entry.debitMinor
    totals.creditMinor += entry.creditMinor
    const k = totals.byKind[entry.kind]
    k.debitMinor += entry.debitMinor
    k.creditMinor += entry.creditMinor
    k.count += 1
    if (entry.kind === 'DEMAND' || entry.kind === 'CONCESSION' || entry.kind === 'LATE_FEE') {
      const details = entry.kind === 'LATE_FEE' ? [{ label: 'Late fee', amountMinor: entry.debitMinor, feeHeadId: null }] : entry.details
      for (const d of details) {
        const key = d.feeHeadId ?? `label:${d.label}`
        const head = heads.get(key) ?? { feeHeadId: d.feeHeadId ?? null, name: d.label, demandMinor: 0, concessionMinor: 0, netMinor: 0 }
        if (entry.kind === 'CONCESSION') head.concessionMinor += d.amountMinor
        else head.demandMinor += d.amountMinor
        head.netMinor = head.demandMinor - head.concessionMinor
        heads.set(key, head)
      }
    }
    return { ...entry, balanceMinor: running, side: balanceSide(running) }
  })

  const kinds = options.kinds?.length ? new Set(options.kinds) : null
  const filtered = kinds ? rows.filter((r) => kinds.has(r.kind)) : rows
  const pageSize = Math.min(Math.max(1, Math.trunc(options.pageSize ?? 50)), 200)
  const page = Math.max(1, Math.trunc(options.page ?? 1))
  const start = (page - 1) * pageSize

  return {
    fiscalYear: span,
    openingMinor: opening,
    closingMinor: running,
    closingSide: balanceSide(running),
    totals,
    byFeeHead: [...heads.values()].sort((a, b) => b.demandMinor - a.demandMinor || a.name.localeCompare(b.name)),
    rows: filtered.slice(start, start + pageSize),
    totalRows: filtered.length,
  }
}

export type ReconciliationIssue = {
  code:
    | 'INVOICE_TOTAL_MISMATCH'
    | 'INVOICE_PAID_MISMATCH'
    | 'INVOICE_BALANCE_MISMATCH'
    | 'OVERPAID_INVOICE'
    | 'ALLOCATION_TO_EXCLUDED_INVOICE'
    | 'UNSUPPORTED_CREDIT_TYPE'
    | 'NEGATIVE_ADVANCE'
  severity: 'error' | 'warning' | 'info'
  message: string
  sourceId: string
  amountMinor?: number
}

export type StudentLedgerReconciliation = {
  ok: boolean
  ledgerClosingMinor: number
  invoiceBalanceMinor: number
  advanceMinor: number
  expectedClosingMinor: number
  differenceMinor: number
  /** What the Student 360 Fees card shows: positive open balances only. */
  cardOutstandingMinor: number
  countedInvoices: number
  excludedInvoices: number
  approximateDatedEntries: number
  issues: ReconciliationIssue[]
}

/**
 * Proves the projection against the fee module's own stored balances. The
 * ledger is trustworthy when `differenceMinor` is zero and no error-severity
 * issue is present.
 */
export function reconcileStudentLedger(
  snapshot: StudentFeeSnapshot,
  entries: LedgerEntry[] = buildStudentLedgerEntries(snapshot),
): StudentLedgerReconciliation {
  const issues: ReconciliationIssue[] = []
  const counted = snapshot.invoices.filter(isCountedInvoice)
  const countedIds = new Set(counted.map((i) => i.id))
  const received = snapshot.payments.filter((p) => RECEIVED_PAYMENT_STATUSES.has(p.status))
  const settling = received.filter((p) => p.status !== 'REVERSED')

  const paidByInvoice = new Map<string, number>()
  const add = (id: string, n: number) => paidByInvoice.set(id, (paidByInvoice.get(id) ?? 0) + n)
  for (const p of settling) for (const a of p.allocations) add(a.invoiceId, a.amountMinor)
  const receivedIds = new Set(received.map((p) => p.id))
  for (const r of snapshot.refunds) {
    if (r.status !== 'SUCCESS' || !receivedIds.has(r.paymentId)) continue
    for (const a of r.allocations) add(a.invoiceId, -a.amountMinor)
  }

  for (const invoice of counted) {
    const components = invoice.subtotalMinor - invoice.discountMinor + invoice.taxMinor + invoice.lateFeeMinor
    if (components !== invoice.totalMinor) {
      issues.push({
        code: 'INVOICE_TOTAL_MISMATCH',
        severity: 'error',
        message: `${invoice.number}: stored total ${invoice.totalMinor} differs from its components ${components}`,
        sourceId: invoice.id,
        amountMinor: invoice.totalMinor - components,
      })
    }
    const paid = paidByInvoice.get(invoice.id) ?? 0
    if (paid !== invoice.paidMinor) {
      issues.push({
        code: 'INVOICE_PAID_MISMATCH',
        severity: 'error',
        message: `${invoice.number}: stored paid ${invoice.paidMinor} differs from receipts less refunds ${paid}`,
        sourceId: invoice.id,
        amountMinor: invoice.paidMinor - paid,
      })
    }
    if (invoice.totalMinor - invoice.paidMinor !== invoice.balanceMinor) {
      issues.push({
        code: 'INVOICE_BALANCE_MISMATCH',
        severity: 'error',
        message: `${invoice.number}: stored balance ${invoice.balanceMinor} is not total less paid`,
        sourceId: invoice.id,
        amountMinor: invoice.balanceMinor - (invoice.totalMinor - invoice.paidMinor),
      })
    }
    if (invoice.balanceMinor < 0) {
      issues.push({
        code: 'OVERPAID_INVOICE',
        severity: 'warning',
        message: `${invoice.number} is overpaid by ${-invoice.balanceMinor}; the Fees card ignores negative balances`,
        sourceId: invoice.id,
        amountMinor: invoice.balanceMinor,
      })
    }
  }

  for (const p of received) {
    for (const a of p.allocations) {
      if (countedIds.has(a.invoiceId)) continue
      issues.push({
        code: 'ALLOCATION_TO_EXCLUDED_INVOICE',
        severity: 'warning',
        message: `Receipt ${p.receiptNumber ?? p.id} has ${a.amountMinor} allocated to a cancelled or draft invoice`,
        sourceId: p.id,
        amountMinor: a.amountMinor,
      })
    }
  }

  for (const c of snapshot.credits) {
    if (c.type !== 'APPLIED') continue
    issues.push({
      code: 'UNSUPPORTED_CREDIT_TYPE',
      severity: 'error',
      message: `Advance entry ${c.id} is APPLIED, which the statement does not project`,
      sourceId: c.id,
      amountMinor: c.amountMinor,
    })
  }

  const advanceMinor = advanceBalanceOf(snapshot.credits)
  if (advanceMinor < 0) {
    issues.push({
      code: 'NEGATIVE_ADVANCE',
      severity: 'error',
      message: `Advance balance is negative (${advanceMinor})`,
      sourceId: 'advance',
      amountMinor: advanceMinor,
    })
  }

  const invoiceBalanceMinor = counted.reduce((s, i) => s + i.balanceMinor, 0)
  const ledgerClosingMinor = entries.reduce((s, e) => s + e.debitMinor - e.creditMinor, 0)
  const expectedClosingMinor = invoiceBalanceMinor - advanceMinor
  const differenceMinor = ledgerClosingMinor - expectedClosingMinor

  return {
    ok: differenceMinor === 0 && !issues.some((i) => i.severity === 'error'),
    ledgerClosingMinor,
    invoiceBalanceMinor,
    advanceMinor,
    expectedClosingMinor,
    differenceMinor,
    cardOutstandingMinor: counted.reduce((s, i) => s + Math.max(0, i.balanceMinor), 0),
    countedInvoices: counted.length,
    excludedInvoices: snapshot.invoices.length - counted.length,
    approximateDatedEntries: entries.filter((e) => e.approximateDate).length,
    issues,
  }
}
