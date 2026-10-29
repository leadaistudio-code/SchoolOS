import { describe, expect, it } from 'vitest'
import {
  ApprovalRuleError,
  availableActions,
  planTransition,
  projectProfitAndLoss,
  type ApprovalAction,
  type ApprovalStatus,
  type ProvisionalItem,
  type StepRecord,
} from '@/server/modules/accounting/expense-approval'

const ALL = ['expense_approval.validate', 'expense_approval.approve_department', 'expense_approval.approve_finance', 'expense_approval.approve_final']
const actor = (id: string, permissions: string[] = ALL) => ({ id, can: (p: string) => permissions.includes(p) })

function plan(status: ApprovalStatus, action: ApprovalAction, opts: { by?: ReturnType<typeof actor>; steps?: StepRecord[]; remarks?: string; expected?: ApprovalStatus; cycle?: number; departmentStage?: boolean } = {}) {
  return planTransition({
    request: { status, cycle: opts.cycle ?? 1, createdById: 'creator' },
    steps: opts.steps ?? [],
    actor: opts.by ?? actor('someone'),
    action,
    remarks: opts.remarks,
    expected: opts.expected,
    departmentStage: opts.departmentStage ?? true,
  })
}

function code(fn: () => unknown) {
  try {
    fn()
  } catch (e) {
    if (e instanceof ApprovalRuleError) return e.code
    throw e
  }
  return null
}

describe('expense approval: the happy path', () => {
  it('moves through all five stages, each signed by a different person, and only the last posts', () => {
    const creator = actor('creator', [])
    expect(plan('DRAFT', 'submit', { by: creator })).toMatchObject({ to: 'SUBMITTED', step: 'SUBMIT', posts: false })
    const v = plan('SUBMITTED', 'approve', { by: actor('v') })
    expect(v).toMatchObject({ to: 'PENDING_L1', step: 'VALIDATE', posts: false })
    const l1 = plan('PENDING_L1', 'approve', { by: actor('l1'), steps: [{ cycle: 1, action: 'VALIDATE', actorId: 'v' }] })
    expect(l1).toMatchObject({ to: 'PENDING_L2', step: 'APPROVE_L1', posts: false })
    const l2 = plan('PENDING_L2', 'approve', { by: actor('l2') })
    expect(l2).toMatchObject({ to: 'PENDING_FINAL', step: 'APPROVE_L2', posts: false })
    const fin = plan('PENDING_FINAL', 'approve', { by: actor('p') })
    expect(fin).toMatchObject({ to: 'POSTED', step: 'APPROVE_FINAL', posts: true })
  })

  it('skips the Department head stage when the school has not switched it on', () => {
    expect(plan('SUBMITTED', 'approve', { by: actor('checker'), departmentStage: false })).toMatchObject({ to: 'PENDING_L2', step: 'VALIDATE' })
  })
})

describe('expense approval: who may act', () => {
  it('needs the permission for the stage the expense is at', () => {
    expect(code(() => plan('SUBMITTED', 'approve', { by: actor('x', ['expense_approval.approve_final']) }))).toBe('FORBIDDEN')
    expect(code(() => plan('PENDING_L1', 'approve', { by: actor('x', ['expense_approval.validate']) }))).toBe('FORBIDDEN')
    expect(code(() => plan('PENDING_L2', 'reject', { by: actor('x', ['expense_approval.approve_department']), remarks: 'no budget' }))).toBe('FORBIDDEN')
    expect(code(() => plan('PENDING_FINAL', 'approve', { by: actor('x', ['expense_approval.approve_finance']) }))).toBe('FORBIDDEN')
    expect(code(() => plan('PENDING_FINAL', 'approve', { by: actor('x', ['expense_approval.approve_final']) }))).toBeNull()
  })

  it('never lets the creator act on their own expense at any stage, even with every permission', () => {
    const creator = actor('creator')
    for (const status of ['SUBMITTED', 'PENDING_L1', 'PENDING_L2', 'PENDING_FINAL'] as const) {
      expect(code(() => plan(status, 'approve', { by: creator }))).toBe('SEPARATION_OF_DUTIES')
      expect(code(() => plan(status, 'return', { by: creator, remarks: 'fix it' }))).toBe('SEPARATION_OF_DUTIES')
      expect(code(() => plan(status, 'reject', { by: creator, remarks: 'drop it' }))).toBe('SEPARATION_OF_DUTIES')
    }
  })

  it('lets one person sign at most one stage of a submission', () => {
    const steps: StepRecord[] = [{ cycle: 1, action: 'VALIDATE', actorId: 'v' }]
    expect(code(() => plan('PENDING_L1', 'approve', { by: actor('v'), steps }))).toBe('SEPARATION_OF_DUTIES')
    expect(code(() => plan('PENDING_FINAL', 'approve', { by: actor('v'), steps }))).toBe('SEPARATION_OF_DUTIES')
    // A signer may still return or reject at a later stage.
    expect(plan('PENDING_L1', 'return', { by: actor('v'), steps, remarks: 'wrong head' }).to).toBe('RETURNED')
  })

  it('clears earlier sign-offs once a returned expense is resubmitted', () => {
    const steps: StepRecord[] = [{ cycle: 1, action: 'VALIDATE', actorId: 'v' }]
    expect(code(() => plan('SUBMITTED', 'approve', { by: actor('v'), steps, cycle: 2 }))).toBeNull()
    expect(code(() => plan('SUBMITTED', 'approve', { by: actor('v'), steps: [...steps, { cycle: 2, action: 'APPROVE_L1', actorId: 'v' }], cycle: 2 }))).toBe('SEPARATION_OF_DUTIES')
  })

  it('only lets the creator submit or withdraw', () => {
    expect(code(() => plan('DRAFT', 'submit', { by: actor('other') }))).toBe('FORBIDDEN')
    expect(code(() => plan('SUBMITTED', 'withdraw', { by: actor('other') }))).toBe('FORBIDDEN')
    expect(plan('SUBMITTED', 'withdraw', { by: actor('creator', []) }).to).toBe('WITHDRAWN')
  })

  it('only lets a final approver reverse a posted expense', () => {
    expect(code(() => plan('POSTED', 'reverse', { by: actor('x', ['expense_approval.approve_finance']), remarks: 'duplicate' }))).toBe('FORBIDDEN')
    expect(plan('POSTED', 'reverse', { by: actor('x', ['expense_approval.approve_final']), remarks: 'duplicate' })).toMatchObject({ to: 'REVERSED', posts: false })
  })
})

describe('expense approval: transitions and remarks', () => {
  it('requires remarks to return, reject or reverse', () => {
    expect(code(() => plan('SUBMITTED', 'return', { remarks: '' }))).toBe('REMARKS_REQUIRED')
    expect(code(() => plan('PENDING_L2', 'reject', { remarks: 'no' }))).toBe('REMARKS_REQUIRED')
    expect(code(() => plan('POSTED', 'reverse', { remarks: '  ' }))).toBe('REMARKS_REQUIRED')
    expect(plan('PENDING_L2', 'reject', { remarks: 'Not in budget' }).to).toBe('REJECTED')
  })

  it('starts a new cycle when a returned expense is resubmitted', () => {
    expect(plan('RETURNED', 'submit', { by: actor('creator', []) })).toMatchObject({ to: 'SUBMITTED', newCycle: true })
    expect(plan('DRAFT', 'submit', { by: actor('creator', []) }).newCycle).toBe(false)
  })

  it('treats rejected, withdrawn, posted and reversed as closed to approval', () => {
    for (const status of ['REJECTED', 'WITHDRAWN', 'POSTED', 'REVERSED', 'DRAFT', 'RETURNED'] as const) {
      expect(code(() => plan(status, 'approve'))).toBe('NOT_ALLOWED')
      expect(code(() => plan(status, 'reject', { remarks: 'nope nope' }))).toBe('NOT_ALLOWED')
    }
    expect(code(() => plan('REJECTED', 'submit', { by: actor('creator', []) }))).toBe('NOT_ALLOWED')
    expect(code(() => plan('PENDING_L1', 'withdraw', { by: actor('creator', []) }))).toBe('NOT_ALLOWED')
    expect(code(() => plan('REVERSED', 'reverse', { remarks: 'again' }))).toBe('NOT_ALLOWED')
  })

  it('refuses a stale action, so a double click or a second approver cannot approve twice', () => {
    expect(code(() => plan('PENDING_L1', 'approve', { expected: 'SUBMITTED' }))).toBe('STALE')
    expect(code(() => plan('POSTED', 'approve', { expected: 'PENDING_FINAL' }))).toBe('STALE')
    // Without the expected status the locked state still stops a second final approval.
    expect(code(() => plan('POSTED', 'approve'))).toBe('NOT_ALLOWED')
  })

  it('offers only the actions the person can take', () => {
    const req = { status: 'PENDING_L1' as const, cycle: 1, createdById: 'creator' }
    expect(availableActions(req, [], actor('l1', ['expense_approval.approve_department']))).toEqual(['approve', 'return', 'reject'])
    expect(availableActions(req, [], actor('creator'))).toEqual([])
    expect(availableActions(req, [{ cycle: 1, action: 'VALIDATE', actorId: 'v' }], actor('v'))).toEqual(['return', 'reject'])
    expect(availableActions({ ...req, status: 'DRAFT' }, [], actor('creator', []))).toEqual(['submit', 'withdraw'])
  })
})

describe('provisional profit and loss', () => {
  const actual = {
    incomeMinor: 1_000_000,
    directMinor: 300_000,
    indirectMinor: 200_000,
    directExpenses: [],
    indirectExpenses: [],
  }
  const item = (requestId: string, amountMinor: number, status: ApprovalStatus, expenseNature: string | null = 'INDIRECT'): ProvisionalItem => ({
    requestId, number: requestId, title: requestId, status, expenseDate: '2026-10-01', amountMinor,
    accountId: 'acc', accountCode: '5100', accountName: 'Repairs', expenseNature,
  })

  it('leaves the actuals alone and adds pending expenses on top', () => {
    const p = projectProfitAndLoss(actual, [item('a', 50_000, 'SUBMITTED', 'DIRECT'), item('b', 20_000, 'PENDING_FINAL')])
    expect(p).toMatchObject({
      actualIncomeMinor: 1_000_000,
      actualExpenseMinor: 500_000,
      actualSurplusMinor: 500_000,
      provisionalDirectMinor: 50_000,
      provisionalIndirectMinor: 20_000,
      provisionalMinor: 70_000,
      projectedDirectMinor: 350_000,
      projectedIndirectMinor: 220_000,
      projectedGrossSurplusMinor: 650_000,
      projectedSurplusMinor: 430_000,
      varianceMinor: -70_000,
    })
    expect(actual).toMatchObject({ directMinor: 300_000, indirectMinor: 200_000 })
  })

  it('counts each voucher exactly once', () => {
    const p = projectProfitAndLoss(actual, [item('a', 50_000, 'PENDING_L1'), item('a', 50_000, 'PENDING_L1'), item('b', 10_000, 'PENDING_L2')])
    expect(p.items.map((i) => i.requestId)).toEqual(['a', 'b'])
    expect(p.provisionalMinor).toBe(60_000)
  })

  it('leaves out drafts, returned, rejected, withdrawn, posted and reversed expenses', () => {
    const excluded = (['DRAFT', 'RETURNED', 'REJECTED', 'WITHDRAWN', 'POSTED', 'REVERSED'] as const).map((s, i) => item(`x${i}`, 99_000, s))
    const p = projectProfitAndLoss(actual, [...excluded, item('ok', 1_000, 'SUBMITTED')])
    expect(p.items.map((i) => i.requestId)).toEqual(['ok'])
    expect(p.provisionalMinor).toBe(1_000)
    expect(p.varianceMinor).toBe(-1_000)
  })

  it('shows no variance when nothing is pending', () => {
    const p = projectProfitAndLoss(actual, [])
    expect(p.projectedSurplusMinor).toBe(p.actualSurplusMinor)
    expect(p.varianceMinor).toBe(0)
  })
})
