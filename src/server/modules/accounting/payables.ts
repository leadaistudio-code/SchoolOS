/**
 * Accounts-payable rules with no database access, so every limit and formula
 * is unit-tested on its own. Money is integer paise throughout.
 *
 * Metric formulas (per vendor; only POSTED vouchers, payments and adjustments
 * and APPROVED debit notes count; drafts, submissions, rejections and
 * cancellations never do):
 *
 *   Total invoiced      = Σ purchase voucher totals
 *   Total settled       = Σ payment amounts (allocated to bills or on account)
 *   Total debit notes   = Σ approved debit note totals
 *   Total adjustments   = Σ discounts + write-offs (shown separately)
 *   Net liability       = invoiced − settled − debit notes − adjustments
 *
 *   Bill outstanding    = bill total − Σ allocations to it − Σ its approved
 *                         debit notes − Σ its adjustments
 *   On account          = Σ payments − Σ their allocations
 *
 * Each payment is counted once, either against a bill or on account, so
 *   Σ bill outstanding − on account = net liability
 * which `summariseVendor` asserts as its reconciliation check.
 */

import { percentOf } from '@/lib/money'
import { MAX_MINOR } from './money'

// ------------------------------------------------------------ identifiers

const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const PAN_SHAPE = /^[A-Z]{5}[0-9]{4}[A-Z]$/

export function normaliseTaxId(value: string | null | undefined): string | null {
  const v = (value ?? '').replace(/\s+/g, '').toUpperCase()
  return v ? v : null
}

/** GSTIN check character: mod-36 weighted sum over the first 14 characters. */
export function gstinCheckChar(first14: string): string {
  let sum = 0
  for (let i = 0; i < 14; i++) {
    const code = GSTIN_CHARS.indexOf(first14[i]!)
    const product = code * (i % 2 === 0 ? 1 : 2)
    sum += Math.floor(product / 36) + (product % 36)
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36]!
}

export function isValidGstin(value: string): boolean {
  return GSTIN_SHAPE.test(value) && gstinCheckChar(value.slice(0, 14)) === value[14]
}

export function isValidPan(value: string): boolean {
  return PAN_SHAPE.test(value)
}

export type TaxIdIssue = { field: 'gstin' | 'pan'; message: string }

/** Both identifiers are optional; when present they must be well formed and agree. */
export function checkVendorTaxIds(gstin: string | null, pan: string | null): TaxIdIssue[] {
  const issues: TaxIdIssue[] = []
  if (gstin && !isValidGstin(gstin)) issues.push({ field: 'gstin', message: 'Enter a valid 15-character GSTIN' })
  if (pan && !isValidPan(pan)) issues.push({ field: 'pan', message: 'Enter a valid 10-character PAN' })
  if (gstin && pan && !issues.length && gstin.slice(2, 12) !== pan) {
    issues.push({ field: 'pan', message: 'PAN does not match the PAN inside the GSTIN' })
  }
  return issues
}

/** Duplicate key for a supplier's invoice number: letters and digits, upper case. */
export function supplierInvoiceKey(invoiceNo: string): string {
  return invoiceNo.toUpperCase().replace(/[^0-9A-Z]/g, '')
}

export function cancelledInvoiceKey(key: string, voucherId: string): string {
  return `${key}#CANCELLED#${voucherId}`
}

// ------------------------------------------------------------ voucher lines

export type PurchaseLineInput = { quantity: number; unitCostMinor: number; taxPercent: number }
export type PurchaseLineAmounts = { amountMinor: number; taxMinor: number; totalMinor: number }

export function computePurchaseLine(line: PurchaseLineInput): PurchaseLineAmounts {
  if (!Number.isInteger(line.quantity) || line.quantity <= 0) throw new RangeError('Quantity must be a whole number above zero')
  if (!Number.isInteger(line.unitCostMinor) || line.unitCostMinor < 0) throw new RangeError('Unit cost must be zero or more')
  if (!(line.taxPercent >= 0 && line.taxPercent <= 100)) throw new RangeError('Tax must be between 0 and 100 percent')
  const amountMinor = line.quantity * line.unitCostMinor
  const taxMinor = percentOf(amountMinor, line.taxPercent)
  const totalMinor = amountMinor + taxMinor
  if (totalMinor > MAX_MINOR) throw new RangeError('Line amount is too large')
  return { amountMinor, taxMinor, totalMinor }
}

export function sumPurchaseLines(lines: PurchaseLineAmounts[]) {
  const subtotalMinor = lines.reduce((s, l) => s + l.amountMinor, 0)
  const taxMinor = lines.reduce((s, l) => s + l.taxMinor, 0)
  const totalMinor = subtotalMinor + taxMinor
  if (totalMinor > MAX_MINOR) throw new RangeError('Voucher total is too large')
  return { subtotalMinor, taxMinor, totalMinor }
}

// ------------------------------------------------------------ bill balances

export type BillFacts = {
  id: string
  totalMinor: number
  allocatedMinor: number
  approvedNotesMinor: number
  pendingNotesMinor: number
  adjustmentsMinor: number
}

export function billOutstanding(b: Omit<BillFacts, 'id' | 'pendingNotesMinor'>): number {
  return b.totalMinor - b.allocatedMinor - b.approvedNotesMinor - b.adjustmentsMinor
}

/** What a new debit note, discount or write-off may still take off this bill. */
export function billReducible(b: Omit<BillFacts, 'id'>): number {
  return Math.max(0, billOutstanding(b) - b.pendingNotesMinor)
}

// ------------------------------------------------------------ debit notes

export type VoucherLineFacts = {
  id: string
  quantity: number
  amountMinor: number
  taxMinor: number
  taxPercent: number
  /** Already returned on SUBMITTED or APPROVED notes. */
  returnedQuantity: number
  returnedAmountMinor: number
  returnedTaxMinor: number
}

export type DebitNoteLineRequest = {
  voucherLineId: string
  /** Units returned. Zero means a value-only allowance (rate difference, shortage). */
  quantity: number
  /** Pre-tax value for a value-only allowance; ignored when quantity is set. */
  amountMinor?: number
}

export type DebitNoteLineResult = {
  voucherLineId: string
  quantity: number
  amountMinor: number
  taxMinor: number
  totalMinor: number
}

export type DebitNoteIssue = { code: string; message: string; voucherLineId?: string }

/**
 * Prices a debit note against the original lines and every earlier active
 * return. Quantity returns are priced pro rata; returning the last units takes
 * exactly what is left, so rounding can never leave or overdraw a paisa.
 */
export function priceDebitNote(
  lines: VoucherLineFacts[],
  requests: DebitNoteLineRequest[],
  billReducibleMinor: number,
): { ok: true; lines: DebitNoteLineResult[]; totalMinor: number } | { ok: false; issues: DebitNoteIssue[] } {
  const issues: DebitNoteIssue[] = []
  const out: DebitNoteLineResult[] = []
  const seen = new Set<string>()
  if (requests.length === 0) issues.push({ code: 'NO_LINES', message: 'Choose at least one line to return' })

  for (const req of requests) {
    const line = lines.find((l) => l.id === req.voucherLineId)
    if (!line) {
      issues.push({ code: 'UNKNOWN_LINE', message: 'That line is not on this purchase voucher', voucherLineId: req.voucherLineId })
      continue
    }
    if (seen.has(line.id)) {
      issues.push({ code: 'DUPLICATE_LINE', message: 'Each line can appear once per debit note', voucherLineId: line.id })
      continue
    }
    seen.add(line.id)
    const leftQty = line.quantity - line.returnedQuantity
    const leftAmount = line.amountMinor - line.returnedAmountMinor
    const leftTax = line.taxMinor - line.returnedTaxMinor

    let amountMinor: number
    let taxMinor: number
    if (!Number.isInteger(req.quantity) || req.quantity < 0) {
      issues.push({ code: 'INVALID_QUANTITY', message: 'Quantity must be a whole number', voucherLineId: line.id })
      continue
    }
    if (req.quantity > 0) {
      if (req.quantity > leftQty) {
        issues.push({
          code: 'QUANTITY_EXCEEDED',
          message: `Only ${leftQty} of ${line.quantity} can still be returned on this line`,
          voucherLineId: line.id,
        })
        continue
      }
      if (req.quantity === leftQty) {
        amountMinor = leftAmount
        taxMinor = leftTax
      } else {
        amountMinor = Math.min(leftAmount, Math.round((line.amountMinor * req.quantity) / line.quantity))
        taxMinor = Math.min(leftTax, Math.round((line.taxMinor * req.quantity) / line.quantity))
      }
    } else {
      const value = req.amountMinor ?? 0
      if (!Number.isInteger(value) || value <= 0) {
        issues.push({ code: 'INVALID_AMOUNT', message: 'Enter a quantity or an amount', voucherLineId: line.id })
        continue
      }
      if (value > leftAmount) {
        issues.push({ code: 'VALUE_EXCEEDED', message: `Only ${leftAmount} paise can still be returned on this line`, voucherLineId: line.id })
        continue
      }
      amountMinor = value
      taxMinor = Math.min(leftTax, percentOf(value, line.taxPercent))
    }
    const totalMinor = amountMinor + taxMinor
    if (totalMinor <= 0) {
      issues.push({ code: 'NOTHING_LEFT', message: 'Nothing is left to return on this line', voucherLineId: line.id })
      continue
    }
    out.push({ voucherLineId: line.id, quantity: req.quantity, amountMinor, taxMinor, totalMinor })
  }

  const totalMinor = out.reduce((s, l) => s + l.totalMinor, 0)
  if (!issues.length && totalMinor > billReducibleMinor) {
    issues.push({
      code: 'EXCEEDS_BILL_BALANCE',
      message: `This bill can only be reduced by ${billReducibleMinor} paise more`,
    })
  }
  return issues.length ? { ok: false, issues } : { ok: true, lines: out, totalMinor }
}

// ------------------------------------------------------------ payments

export type OpenBill = { id: string; dueDate: string; number: string; reducibleMinor: number }

/**
 * Splits a payment over bills. Explicit allocations are validated against what
 * each bill still owes; without them, money goes oldest due date first. Any
 * remainder stays on account (an advance to the vendor).
 */
export function allocateVendorPayment(
  amountMinor: number,
  bills: OpenBill[],
  explicit?: { voucherId: string; amountMinor: number }[],
):
  | { ok: true; allocations: { voucherId: string; amountMinor: number }[]; onAccountMinor: number }
  | { ok: false; message: string } {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0 || amountMinor > MAX_MINOR) {
    return { ok: false, message: 'Enter a payment amount above zero' }
  }
  const byId = new Map(bills.map((b) => [b.id, b]))
  if (explicit && explicit.length) {
    const seen = new Set<string>()
    let used = 0
    for (const a of explicit) {
      const bill = byId.get(a.voucherId)
      if (!bill) return { ok: false, message: 'A selected bill is not open for this vendor' }
      if (seen.has(a.voucherId)) return { ok: false, message: 'Each bill can be paid once per payment' }
      seen.add(a.voucherId)
      if (!Number.isInteger(a.amountMinor) || a.amountMinor <= 0) return { ok: false, message: 'Allocations must be above zero' }
      if (a.amountMinor > bill.reducibleMinor) return { ok: false, message: `Bill ${bill.number} has only ${bill.reducibleMinor} paise outstanding` }
      used += a.amountMinor
    }
    if (used > amountMinor) return { ok: false, message: 'Allocations add up to more than the payment' }
    return { ok: true, allocations: explicit.map((a) => ({ ...a })), onAccountMinor: amountMinor - used }
  }
  let left = amountMinor
  const allocations: { voucherId: string; amountMinor: number }[] = []
  const ordered = [...bills].sort((a, b) => (a.dueDate === b.dueDate ? a.number.localeCompare(b.number) : a.dueDate < b.dueDate ? -1 : 1))
  for (const bill of ordered) {
    if (left <= 0) break
    const take = Math.min(left, bill.reducibleMinor)
    if (take <= 0) continue
    allocations.push({ voucherId: bill.id, amountMinor: take })
    left -= take
  }
  return { ok: true, allocations, onAccountMinor: left }
}

// ------------------------------------------------------------ summary

export type VendorFacts = {
  vouchers: { id: string; number: string; supplierInvoiceNo: string; invoiceDate: string; dueDate: string; status: string; totalMinor: number }[]
  payments: { id: string; status: string; amountMinor: number; allocations: { voucherId: string; amountMinor: number }[] }[]
  debitNotes: { id: string; voucherId: string; status: string; totalMinor: number }[]
  adjustments: { id: string; voucherId: string; status: string; type: string; amountMinor: number }[]
}

export type BillLine = {
  voucherId: string
  number: string
  supplierInvoiceNo: string
  invoiceDate: string
  dueDate: string
  totalMinor: number
  paidMinor: number
  debitNotesMinor: number
  pendingDebitNotesMinor: number
  adjustmentsMinor: number
  outstandingMinor: number
  reducibleMinor: number
  overdue: boolean
}

export type VendorSummary = {
  totalInvoicedMinor: number
  totalSettledMinor: number
  totalDebitNotesMinor: number
  totalAdjustmentsMinor: number
  netLiabilityMinor: number
  onAccountMinor: number
  billOutstandingMinor: number
  pendingDebitNotesMinor: number
  bills: BillLine[]
  reconciled: boolean
}

export function summariseVendor(facts: VendorFacts, today: string): VendorSummary {
  const posted = facts.vouchers.filter((v) => v.status === 'POSTED')
  const postedIds = new Set(posted.map((v) => v.id))
  const payments = facts.payments.filter((p) => p.status === 'POSTED')
  const notes = facts.debitNotes.filter((n) => n.status === 'APPROVED')
  const pending = facts.debitNotes.filter((n) => n.status === 'SUBMITTED')
  const adjustments = facts.adjustments.filter((a) => a.status === 'POSTED')

  const sumBy = <T extends { voucherId: string }>(rows: T[], pick: (r: T) => number) => {
    const m = new Map<string, number>()
    for (const r of rows) m.set(r.voucherId, (m.get(r.voucherId) ?? 0) + pick(r))
    return m
  }
  const allocations = payments.flatMap((p) => p.allocations)
  const paidBy = sumBy(allocations, (a) => a.amountMinor)
  const notesBy = sumBy(notes, (n) => n.totalMinor)
  const pendingBy = sumBy(pending, (n) => n.totalMinor)
  const adjBy = sumBy(adjustments, (a) => a.amountMinor)

  const bills: BillLine[] = posted
    .map((v) => {
      const facts = {
        totalMinor: v.totalMinor,
        allocatedMinor: paidBy.get(v.id) ?? 0,
        approvedNotesMinor: notesBy.get(v.id) ?? 0,
        pendingNotesMinor: pendingBy.get(v.id) ?? 0,
        adjustmentsMinor: adjBy.get(v.id) ?? 0,
      }
      const outstandingMinor = billOutstanding(facts)
      return {
        voucherId: v.id,
        number: v.number,
        supplierInvoiceNo: v.supplierInvoiceNo,
        invoiceDate: v.invoiceDate,
        dueDate: v.dueDate,
        totalMinor: v.totalMinor,
        paidMinor: facts.allocatedMinor,
        debitNotesMinor: facts.approvedNotesMinor,
        pendingDebitNotesMinor: facts.pendingNotesMinor,
        adjustmentsMinor: facts.adjustmentsMinor,
        outstandingMinor,
        reducibleMinor: billReducible(facts),
        overdue: outstandingMinor > 0 && v.dueDate < today,
      }
    })
    .sort((a, b) => (a.dueDate === b.dueDate ? a.number.localeCompare(b.number) : a.dueDate < b.dueDate ? -1 : 1))

  const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)
  const totalInvoicedMinor = sum(posted.map((v) => v.totalMinor))
  const totalSettledMinor = sum(payments.map((p) => p.amountMinor))
  const totalDebitNotesMinor = sum(notes.map((n) => n.totalMinor))
  const totalAdjustmentsMinor = sum(adjustments.map((a) => a.amountMinor))
  const netLiabilityMinor = totalInvoicedMinor - totalSettledMinor - totalDebitNotesMinor - totalAdjustmentsMinor
  const onAccountMinor = totalSettledMinor - sum(allocations.map((a) => a.amountMinor))
  const billOutstandingMinor = sum(bills.map((b) => b.outstandingMinor))

  // Any allocation, note or adjustment pointing at a non-posted bill breaks the identity.
  const orphan =
    allocations.some((a) => !postedIds.has(a.voucherId)) ||
    notes.some((n) => !postedIds.has(n.voucherId)) ||
    adjustments.some((a) => !postedIds.has(a.voucherId))

  return {
    totalInvoicedMinor,
    totalSettledMinor,
    totalDebitNotesMinor,
    totalAdjustmentsMinor,
    netLiabilityMinor,
    onAccountMinor,
    billOutstandingMinor,
    pendingDebitNotesMinor: sum(pending.map((n) => n.totalMinor)),
    bills,
    reconciled: !orphan && billOutstandingMinor - onAccountMinor === netLiabilityMinor,
  }
}
