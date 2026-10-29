import { describe, expect, it } from 'vitest'
import type { JournalApprovalStatus } from '@prisma/client'
import {
  JournalApprovalError,
  initialStatus,
  isCostEntry,
  journalActions,
  nextStatus,
  planJournalAction,
  stagesInUse,
  type JournalAction,
  type JournalStepRecord,
} from '@/server/modules/accounting/journal-approval'

const ALL = ['expense_approval.validate', 'expense_approval.approve_department', 'expense_approval.approve_finance', 'expense_approval.approve_final']
const actor = (id: string, permissions: string[] = ALL) => ({ id, can: (p: string) => permissions.includes(p) })

function plan(
  status: JournalApprovalStatus,
  action: JournalAction,
  opts: { by?: ReturnType<typeof actor>; steps?: JournalStepRecord[]; remarks?: string; departmentStage?: boolean; expected?: JournalApprovalStatus } = {},
) {
  return planJournalAction({
    entry: { status, cycle: 1, createdById: 'maker' },
    steps: opts.steps ?? [],
    actor: opts.by ?? actor('someone'),
    action,
    remarks: opts.remarks,
    departmentStage: opts.departmentStage ?? false,
    expected: opts.expected,
  })
}

function code(fn: () => unknown) {
  try {
    fn()
  } catch (e) {
    if (e instanceof JournalApprovalError) return e.code
    throw e
  }
  return null
}

describe('journal approval: which entries wait', () => {
  it('holds expenses, vendor bills, stock purchases, payroll and fixed assets', () => {
    for (const source of ['EXPENSE', 'PURCHASE_VOUCHER', 'STORE_PURCHASE', 'PAYROLL', 'FIXED_ASSET'] as const) {
      expect(isCostEntry(source, [])).toBe(true)
    }
  })

  it('holds a manual journal only when it touches an expense account', () => {
    expect(isCostEntry('MANUAL', ['EXPENSE', 'ASSET'])).toBe(true)
    expect(isCostEntry('MANUAL', ['ASSET', 'LIABILITY'])).toBe(false)
  })

  it('leaves fee receipts and vendor payments alone', () => {
    expect(isCostEntry('FEE_PAYMENT', ['ASSET', 'INCOME'])).toBe(false)
    expect(isCostEntry('VENDOR_PAYMENT', ['ASSET', 'LIABILITY'])).toBe(false)
  })

  it('starts cost entries with the Checker only while the workflow is on', () => {
    expect(initialStatus({ workflowOn: true, sourceType: 'PURCHASE_VOUCHER', accountTypes: [] })).toBe('PENDING_CHECK')
    expect(initialStatus({ workflowOn: false, sourceType: 'PURCHASE_VOUCHER', accountTypes: [] })).toBe('APPROVED')
    expect(initialStatus({ workflowOn: true, sourceType: 'FEE_PAYMENT', accountTypes: [] })).toBe('APPROVED')
  })

  it('posts an expense request approved, because it was signed before posting', () => {
    expect(initialStatus({ workflowOn: true, preApproved: true, sourceType: 'EXPENSE', accountTypes: [] })).toBe('APPROVED')
  })

  it('makes a reversal follow its original', () => {
    expect(initialStatus({ workflowOn: true, sourceType: 'PURCHASE_VOUCHER', accountTypes: [], reversalOf: 'APPROVED' })).toBe('APPROVED')
    expect(initialStatus({ workflowOn: true, sourceType: 'PURCHASE_VOUCHER', accountTypes: [], reversalOf: 'PENDING_OWNER' })).toBe('VOID')
    expect(initialStatus({ workflowOn: false, sourceType: 'PURCHASE_VOUCHER', accountTypes: [], reversalOf: 'RETURNED' })).toBe('VOID')
  })
})

describe('journal approval: the chain', () => {
  it('runs Checker, Accountant, Owner by default', () => {
    expect(stagesInUse(false).map((s) => s.label)).toEqual(['Checker', 'Accountant', 'Owner'])
    expect(nextStatus('PENDING_CHECK', false)).toBe('PENDING_ACCOUNTANT')
    expect(nextStatus('PENDING_ACCOUNTANT', false)).toBe('PENDING_OWNER')
    expect(nextStatus('PENDING_OWNER', false)).toBe('APPROVED')
  })

  it('adds the Department head after the Checker when switched on', () => {
    expect(stagesInUse(true).map((s) => s.label)).toEqual(['Checker', 'Department head', 'Accountant', 'Owner'])
    expect(nextStatus('PENDING_CHECK', true)).toBe('PENDING_DEPARTMENT')
    expect(nextStatus('PENDING_DEPARTMENT', true)).toBe('PENDING_ACCOUNTANT')
  })

  it('moves an entry waiting on a Department head to the Accountant if the stage is switched off', () => {
    expect(nextStatus('PENDING_DEPARTMENT', false)).toBe('PENDING_ACCOUNTANT')
  })

  it('approves only at the Owner stage', () => {
    const check = plan('PENDING_CHECK', 'approve', { by: actor('c') })
    expect(check).toMatchObject({ to: 'PENDING_ACCOUNTANT', step: 'APPROVE_CHECK', approves: false })
    const acc = plan('PENDING_ACCOUNTANT', 'approve', { by: actor('a'), steps: [{ cycle: 1, action: 'APPROVE_CHECK', actorId: 'c' }] })
    expect(acc).toMatchObject({ to: 'PENDING_OWNER', step: 'APPROVE_ACCOUNTANT', approves: false })
    const owner = plan('PENDING_OWNER', 'approve', { by: actor('o') })
    expect(owner).toMatchObject({ to: 'APPROVED', step: 'APPROVE_OWNER', approves: true })
  })
})

describe('journal approval: who may act', () => {
  it('needs the permission of the stage', () => {
    expect(code(() => plan('PENDING_CHECK', 'approve', { by: actor('x', ['expense_approval.approve_final']) }))).toBe('FORBIDDEN')
    expect(code(() => plan('PENDING_OWNER', 'approve', { by: actor('x', ['expense_approval.approve_finance']) }))).toBe('FORBIDDEN')
    expect(code(() => plan('PENDING_OWNER', 'approve', { by: actor('x', ['expense_approval.approve_final']) }))).toBeNull()
  })

  it('never lets the maker sign or return their own entry', () => {
    for (const status of ['PENDING_CHECK', 'PENDING_ACCOUNTANT', 'PENDING_OWNER'] as const) {
      expect(code(() => plan(status, 'approve', { by: actor('maker') }))).toBe('SEPARATION_OF_DUTIES')
      expect(code(() => plan(status, 'return', { by: actor('maker'), remarks: 'fix it' }))).toBe('SEPARATION_OF_DUTIES')
    }
  })

  it('lets one person sign only one stage of a submission', () => {
    const steps = [{ cycle: 1, action: 'APPROVE_CHECK', actorId: 'c' }]
    expect(code(() => plan('PENDING_ACCOUNTANT', 'approve', { by: actor('c'), steps }))).toBe('SEPARATION_OF_DUTIES')
  })

  it('needs a reason to return', () => {
    expect(code(() => plan('PENDING_ACCOUNTANT', 'return', { by: actor('a') }))).toBe('REMARKS_REQUIRED')
    expect(plan('PENDING_ACCOUNTANT', 'return', { by: actor('a'), remarks: 'wrong head' })).toMatchObject({ to: 'RETURNED', approves: false })
  })

  it('lets the maker resubmit a returned entry, starting a new round at the Checker', () => {
    expect(plan('RETURNED', 'resubmit', { by: actor('maker', []) })).toMatchObject({ to: 'PENDING_CHECK', newCycle: true })
    expect(code(() => plan('RETURNED', 'resubmit', { by: actor('stranger', []) }))).toBe('FORBIDDEN')
    expect(code(() => plan('PENDING_CHECK', 'resubmit', { by: actor('maker') }))).toBe('NOT_ALLOWED')
  })

  it('refuses to act on an entry that moved on since the page was loaded', () => {
    expect(code(() => plan('PENDING_OWNER', 'approve', { by: actor('o'), expected: 'PENDING_ACCOUNTANT' }))).toBe('STALE')
  })

  it('has nothing to approve once approved or void', () => {
    expect(code(() => plan('APPROVED', 'approve', { by: actor('o') }))).toBe('NOT_ALLOWED')
    expect(code(() => plan('VOID', 'approve', { by: actor('o') }))).toBe('NOT_ALLOWED')
  })

  it('offers each person only the buttons they can use', () => {
    const entry = { status: 'PENDING_OWNER' as const, cycle: 1, createdById: 'maker' }
    expect(journalActions(entry, [], actor('o', ['expense_approval.approve_final']), false)).toEqual(['approve', 'return'])
    expect(journalActions(entry, [], actor('maker'), false)).toEqual([])
    expect(journalActions(entry, [], actor('clerk', []), false)).toEqual([])
  })
})
