import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fiscalYearStartingIn } from '@/server/modules/accounting/fiscal-year'
import {
  advanceBalanceOf,
  buildStudentLedgerEntries,
  reconcileStudentLedger,
  schoolDayOf,
  viewStudentLedger,
  type CreditInput,
  type InvoiceInput,
  type PaymentInput,
  type RefundInput,
  type StudentFeeSnapshot,
} from '@/server/modules/accounting/student-ledger'

const flagsMock = vi.hoisted(() => ({ studentLedger: true }))
const scopeMock = vi.hoisted(() => ({ allowed: new Set<string>(['stu_1']) }))

vi.mock('@/server/modules/accounting/service', () => ({
  getAccountingFlags: vi.fn(async () => ({
    module: true,
    studentLedger: flagsMock.studentLedger,
    approvals: false,
    whatsappReceipts: false,
    fiscalYearStartMonth: 4,
  })),
}))

vi.mock('@/server/scope', async () => {
  const { ForbiddenError } = await import('@/server/context')
  return {
    assertStudentAccess: vi.fn(async (_ctx: unknown, studentId: string) => {
      if (!scopeMock.allowed.has(studentId)) throw new ForbiddenError('You do not have access to this student')
    }),
  }
})

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

function invoice(
  over: Partial<Omit<InvoiceInput, 'issuedOn'>> & { id: string; issuedOn: string; subtotal: number },
): InvoiceInput {
  const discount = over.discountMinor ?? 0
  const tax = over.taxMinor ?? 0
  const late = over.lateFeeMinor ?? 0
  const total = over.totalMinor ?? over.subtotal - discount + tax + late
  const paid = over.paidMinor ?? 0
  const { subtotal: _subtotal, issuedOn, ...rest } = over
  return {
    number: over.number ?? `INV-${over.id}`,
    title: over.title ?? `Fee ${over.id}`,
    status: over.status ?? 'ISSUED',
    cancelledAt: over.cancelledAt ?? null,
    dueOn: over.dueOn ?? d(over.issuedOn),
    subtotalMinor: over.subtotal,
    discountMinor: discount,
    taxMinor: tax,
    lateFeeMinor: late,
    totalMinor: total,
    paidMinor: paid,
    balanceMinor: over.balanceMinor ?? total - paid,
    lines: over.lines ?? [
      { feeHeadId: 'head_tuition', feeHeadName: 'Tuition', label: 'Tuition', amountMinor: over.subtotal, discountMinor: discount },
    ],
    ...rest,
    issuedOn: d(issuedOn),
  }
}

function payment(over: Partial<PaymentInput> & { id: string; paidOn: string; allocations: PaymentInput['allocations'] }): PaymentInput {
  return {
    status: 'SUCCESS',
    mode: 'CASH',
    amountMinor: over.amountMinor ?? over.allocations.reduce((s, a) => s + a.amountMinor, 0),
    paidAt: d(over.paidOn),
    createdAt: d(over.paidOn),
    updatedAt: d(over.paidOn),
    receiptNumber: `RCT-${over.id}`,
    reference: null,
    ...over,
  }
}

function snapshot(parts: Partial<StudentFeeSnapshot>): StudentFeeSnapshot {
  return { invoices: [], payments: [], refunds: [], credits: [], adjustments: [], ...parts }
}

const FY2526 = fiscalYearStartingIn(2025)
const FY2627 = fiscalYearStartingIn(2026)

describe('student ledger projection', () => {
  it('debits a demand and credits a receipt, closing at the invoice balance', () => {
    const snap = snapshot({
      invoices: [invoice({ id: 'a', issuedOn: '2026-04-05', subtotal: 1_000_00, paidMinor: 400_00 })],
      payments: [payment({ id: 'p1', paidOn: '2026-04-10', allocations: [{ invoiceId: 'a', amountMinor: 400_00 }] })],
    })
    const entries = buildStudentLedgerEntries(snap)
    expect(entries.map((e) => [e.kind, e.debitMinor, e.creditMinor])).toEqual([
      ['DEMAND', 1_000_00, 0],
      ['RECEIPT', 0, 400_00],
    ])
    const view = viewStudentLedger(entries, { fiscalYear: null })
    expect(view.rows.map((r) => [r.balanceMinor, r.side])).toEqual([[1_000_00, 'Dr'], [600_00, 'Dr']])
    expect(view.closingMinor).toBe(600_00)
    const rec = reconcileStudentLedger(snap, entries)
    expect(rec).toMatchObject({ ok: true, differenceMinor: 0, cardOutstandingMinor: 600_00 })
  })

  it('carries arrears from the previous year into the opening balance', () => {
    const snap = snapshot({
      invoices: [
        invoice({ id: 'old', issuedOn: '2025-06-01', subtotal: 500_00, paidMinor: 200_00 }),
        invoice({ id: 'new', issuedOn: '2026-04-01', subtotal: 800_00 }),
      ],
      payments: [payment({ id: 'p1', paidOn: '2025-07-01', allocations: [{ invoiceId: 'old', amountMinor: 200_00 }] })],
    })
    const entries = buildStudentLedgerEntries(snap)
    const prior = viewStudentLedger(entries, { fiscalYear: FY2526 })
    const current = viewStudentLedger(entries, { fiscalYear: FY2627 })
    const all = viewStudentLedger(entries, { fiscalYear: null })

    expect(prior.openingMinor).toBe(0)
    expect(prior.closingMinor).toBe(300_00)
    expect(current.openingMinor).toBe(prior.closingMinor)
    expect(current.rows).toHaveLength(1)
    expect(current.rows[0]!.balanceMinor).toBe(1_100_00)
    expect(current.closingMinor).toBe(all.closingMinor)
    expect(reconcileStudentLedger(snap, entries).ok).toBe(true)
  })

  it('shows concessions as credits split by fee head, plus invoice-level discount', () => {
    const snap = snapshot({
      invoices: [
        invoice({
          id: 'a',
          issuedOn: '2026-04-01',
          subtotal: 1_500_00,
          discountMinor: 300_00,
          lines: [
            { feeHeadId: 'h_t', feeHeadName: 'Tuition', label: 'Tuition', amountMinor: 1_000_00, discountMinor: 200_00 },
            { feeHeadId: 'h_b', feeHeadName: 'Transport', label: 'Bus', amountMinor: 500_00, discountMinor: 0 },
          ],
        }),
      ],
    })
    const entries = buildStudentLedgerEntries(snap)
    const concession = entries.find((e) => e.kind === 'CONCESSION')!
    expect(concession.creditMinor).toBe(300_00)
    expect(concession.approximateDate).toBe(true)
    expect(concession.details).toEqual([
      { label: 'Tuition', amountMinor: 200_00, feeHeadId: 'h_t' },
      { label: 'Invoice-level discount', amountMinor: 100_00, feeHeadId: null },
    ])
    const view = viewStudentLedger(entries, { fiscalYear: null })
    expect(view.closingMinor).toBe(1_200_00)
    const tuition = view.byFeeHead.find((h) => h.feeHeadId === 'h_t')!
    expect(tuition).toMatchObject({ demandMinor: 1_000_00, concessionMinor: 200_00, netMinor: 800_00 })
    expect(reconcileStudentLedger(snap, entries).ok).toBe(true)
  })

  it('posts tax with the demand and late fee on the due date', () => {
    const snap = snapshot({
      invoices: [invoice({ id: 'a', issuedOn: '2026-04-01', dueOn: d('2026-04-15'), subtotal: 1_000_00, taxMinor: 180_00, lateFeeMinor: 50_00 })],
    })
    const entries = buildStudentLedgerEntries(snap)
    expect(entries.map((e) => [e.kind, e.date, e.debitMinor])).toEqual([
      ['DEMAND', '2026-04-01', 1_180_00],
      ['LATE_FEE', '2026-04-15', 50_00],
    ])
    expect(reconcileStudentLedger(snap, entries).ok).toBe(true)
  })

  it('debits a refund once even when part of it comes out of advance', () => {
    // Paid 1,200 on a 1,000 invoice: 1,000 allocated, 200 parked as advance.
    // Then refunded 500: 300 reopens the invoice, 200 drains the advance.
    const credits: CreditInput[] = [
      { id: 'c1', type: 'CREDIT', amountMinor: 200_00, paymentId: 'p1', invoiceId: null, reference: 'RCT-p1', notes: null, createdAt: d('2026-04-10') },
      { id: 'c2', type: 'REFUND', amountMinor: 200_00, paymentId: 'p1', invoiceId: null, reference: null, notes: null, createdAt: d('2026-05-01') },
    ]
    const refunds: RefundInput[] = [
      {
        id: 'r1', paymentId: 'p1', status: 'SUCCESS', amountMinor: 500_00, reason: 'Withdrawal',
        createdAt: d('2026-05-01'), completedAt: d('2026-05-01'),
        allocations: [{ invoiceId: 'a', amountMinor: 300_00 }],
      },
      {
        id: 'r2', paymentId: 'p1', status: 'FAILED', amountMinor: 999_00, reason: 'Gateway rejected',
        createdAt: d('2026-05-02'), completedAt: null, allocations: [],
      },
    ]
    const snap = snapshot({
      invoices: [invoice({ id: 'a', issuedOn: '2026-04-01', subtotal: 1_000_00, paidMinor: 700_00 })],
      payments: [payment({ id: 'p1', paidOn: '2026-04-10', amountMinor: 1_200_00, status: 'PARTIALLY_REFUNDED', allocations: [{ invoiceId: 'a', amountMinor: 1_000_00 }] })],
      refunds,
      credits,
    })
    const entries = buildStudentLedgerEntries(snap)
    expect(entries.map((e) => [e.kind, e.debitMinor, e.creditMinor])).toEqual([
      ['DEMAND', 1_000_00, 0],
      ['RECEIPT', 0, 1_200_00],
      ['REFUND', 500_00, 0],
    ])
    expect(advanceBalanceOf(credits)).toBe(0)
    const rec = reconcileStudentLedger(snap, entries)
    expect(rec).toMatchObject({ ok: true, ledgerClosingMinor: 300_00, expectedClosingMinor: 300_00 })
  })

  it('keeps an advance as a credit balance', () => {
    const snap = snapshot({
      invoices: [invoice({ id: 'a', issuedOn: '2026-04-01', subtotal: 1_000_00, paidMinor: 1_000_00, status: 'PAID' })],
      payments: [payment({ id: 'p1', paidOn: '2026-04-02', amountMinor: 1_500_00, allocations: [{ invoiceId: 'a', amountMinor: 1_000_00 }] })],
      credits: [{ id: 'c1', type: 'CREDIT', amountMinor: 500_00, paymentId: 'p1', invoiceId: null, reference: null, notes: null, createdAt: d('2026-04-02') }],
    })
    const view = viewStudentLedger(buildStudentLedgerEntries(snap), { fiscalYear: null })
    expect(view.closingMinor).toBe(-500_00)
    expect(view.closingSide).toBe('Cr')
    const rec = reconcileStudentLedger(snap)
    expect(rec).toMatchObject({ ok: true, advanceMinor: 500_00, cardOutstandingMinor: 0 })
  })

  it('nets a reversed payment to zero with a reversal debit', () => {
    const snap = snapshot({
      invoices: [invoice({ id: 'a', issuedOn: '2026-04-01', subtotal: 1_000_00, paidMinor: 0 })],
      payments: [payment({ id: 'p1', paidOn: '2026-04-05', status: 'REVERSED', allocations: [{ invoiceId: 'a', amountMinor: 1_000_00 }] })],
      adjustments: [{ id: 'adj1', type: 'REVERSAL', invoiceId: 'a', amountMinor: 1_000_00, reason: 'Payment p1 reversed: bounced', createdAt: new Date('2026-04-07T09:00:00.000Z') }],
    })
    const entries = buildStudentLedgerEntries(snap)
    const reversal = entries.find((e) => e.kind === 'REVERSAL')!
    expect(reversal).toMatchObject({ debitMinor: 1_000_00, date: '2026-04-07' })
    expect(viewStudentLedger(entries, { fiscalYear: null }).closingMinor).toBe(1_000_00)
    expect(reconcileStudentLedger(snap, entries).ok).toBe(true)
  })

  it('ignores cancelled, draft and failed or pending records', () => {
    const snap = snapshot({
      invoices: [
        invoice({ id: 'a', issuedOn: '2026-04-01', subtotal: 1_000_00 }),
        invoice({ id: 'x', issuedOn: '2026-04-01', subtotal: 9_000_00, status: 'CANCELLED', cancelledAt: d('2026-04-02') }),
        invoice({ id: 'y', issuedOn: '2026-04-01', subtotal: 9_000_00, status: 'DRAFT' }),
      ],
      payments: [
        payment({ id: 'f', paidOn: '2026-04-03', status: 'FAILED', allocations: [] , amountMinor: 1_000_00 }),
        payment({ id: 'q', paidOn: '2026-04-03', status: 'PENDING', allocations: [], amountMinor: 1_000_00 }),
      ],
    })
    const entries = buildStudentLedgerEntries(snap)
    expect(entries).toHaveLength(1)
    expect(reconcileStudentLedger(snap, entries)).toMatchObject({ ok: true, countedInvoices: 1, excludedInvoices: 2 })
  })

  it('flags data the fee module disagrees with instead of hiding it', () => {
    const snap = snapshot({
      invoices: [invoice({ id: 'a', issuedOn: '2026-04-01', subtotal: 1_000_00, paidMinor: 600_00 })],
      payments: [payment({ id: 'p1', paidOn: '2026-04-02', allocations: [{ invoiceId: 'a', amountMinor: 500_00 }] })],
    })
    const rec = reconcileStudentLedger(snap)
    expect(rec.ok).toBe(false)
    expect(rec.differenceMinor).toBe(100_00)
    expect(rec.issues.map((i) => i.code)).toContain('INVOICE_PAID_MISMATCH')
  })

  it('keeps the running balance across pages and filters', () => {
    const invoices = Array.from({ length: 5 }, (_, i) =>
      invoice({ id: `m${i}`, issuedOn: `2026-0${i + 4}-01`, subtotal: 100_00 }))
    const entries = buildStudentLedgerEntries(snapshot({ invoices }))
    const page2 = viewStudentLedger(entries, { fiscalYear: null, page: 2, pageSize: 2 })
    expect(page2.totalRows).toBe(5)
    expect(page2.rows.map((r) => r.balanceMinor)).toEqual([300_00, 400_00])
    const receipts = viewStudentLedger(entries, { fiscalYear: null, kinds: ['RECEIPT'] })
    expect(receipts.rows).toHaveLength(0)
    expect(receipts.closingMinor).toBe(500_00)
  })

  it('reads instants as the school day in India', () => {
    expect(schoolDayOf(new Date('2026-03-31T19:00:00.000Z'))).toBe('2026-04-01')
    expect(schoolDayOf(d('2026-03-31'))).toBe('2026-03-31')
  })
})

describe('student ledger access', () => {
  function fakeCtx(permissions: string[]) {
    const can = (p: string) => permissions.includes(p)
    const empty = { findMany: vi.fn(async () => []) }
    return {
      user: { userId: 'u1', roleKeys: [] },
      tenant: { id: 't1', currency: 'INR' },
      can,
      canAny: (...ps: string[]) => ps.some(can),
      require: (p: string) => {
        if (!can(p)) throw new Error(`Missing permission: ${p}`)
      },
      db: {
        student: { findFirst: vi.fn(async ({ where }: { where: { id: string } }) =>
          where.id === 'stu_1' || where.id === 'stu_2'
            ? { id: where.id, firstName: 'Asha', lastName: 'K', admissionNo: 'A1' }
            : null) },
        feeInvoice: empty,
        feePayment: empty,
        feeRefund: empty,
        studentFeeCredit: empty,
        feeAdjustment: empty,
      },
    } as never
  }

  beforeEach(() => {
    flagsMock.studentLedger = true
    scopeMock.allowed = new Set(['stu_1'])
  })

  it('refuses when the feature is off', async () => {
    flagsMock.studentLedger = false
    const { getStudentLedger, studentLedgerQuerySchema } = await import('@/server/modules/accounting/student-ledger-service')
    await expect(getStudentLedger(fakeCtx(['fees.view']), 'stu_1', studentLedgerQuerySchema.parse({})))
      .rejects.toMatchObject({ status: 403, code: 'FEATURE_DISABLED' })
  })

  it("refuses another family's student", async () => {
    const { getStudentLedger, studentLedgerQuerySchema } = await import('@/server/modules/accounting/student-ledger-service')
    await expect(getStudentLedger(fakeCtx(['fees.view']), 'stu_2', studentLedgerQuerySchema.parse({})))
      .rejects.toThrow('You do not have access to this student')
  })

  it('needs fees.view', async () => {
    const { getStudentLedger, studentLedgerQuerySchema } = await import('@/server/modules/accounting/student-ledger-service')
    await expect(getStudentLedger(fakeCtx(['fees.status']), 'stu_1', studentLedgerQuerySchema.parse({})))
      .rejects.toThrow('Missing permission: fees.view')
  })

  it('hides diagnostics from non-finance viewers and shows them to finance staff', async () => {
    const { getStudentLedger, getStudentLedgerReconciliation, studentLedgerQuerySchema } = await import('@/server/modules/accounting/student-ledger-service')
    const parentView = await getStudentLedger(fakeCtx(['fees.view']), 'stu_1', studentLedgerQuerySchema.parse({}))
    expect(parentView.reconciliation).toBeNull()
    expect(parentView.fiscalYears).toHaveLength(4)
    await expect(getStudentLedgerReconciliation(fakeCtx(['fees.view']), 'stu_1')).rejects.toMatchObject({ status: 403 })
    const staffView = await getStudentLedger(fakeCtx(['fees.view', 'fees.accounts']), 'stu_1', studentLedgerQuerySchema.parse({ fy: '2025-26' }))
    expect(staffView.reconciliation).toMatchObject({ ok: true })
    expect(staffView.fiscalYear?.label).toBe('2025-26')
  })

  it('rejects a financial year that does not match the school calendar', async () => {
    const { getStudentLedger, studentLedgerQuerySchema } = await import('@/server/modules/accounting/student-ledger-service')
    await expect(getStudentLedger(fakeCtx(['fees.view']), 'stu_1', studentLedgerQuerySchema.parse({ fy: '2025-30' })))
      .rejects.toMatchObject({ status: 400 })
    expect(() => studentLedgerQuerySchema.parse({ kind: 'BOGUS' })).toThrow()
  })
})
