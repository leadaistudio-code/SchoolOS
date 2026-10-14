import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ module: true, approvals: true, envApprovals: true }))
const mocks = vi.hoisted(() => ({
  audit: vi.fn(async () => undefined),
  assertPostingAllowed: vi.fn(async () => undefined),
  saveAccountingSettings: vi.fn(async (_ctx: unknown, input: { approvalWorkflowEnabled: boolean }) => input),
  postExpenseInTransaction: vi.fn(async () => ({ id: 'j1', number: 'JV-0001' })),
  reverseExpenseInTransaction: vi.fn(async () => ({ id: 'j2', number: 'JV-0002' })),
  loadResolver: vi.fn(async () => ({ expense: () => 'acc-fallback', mode: () => 'acc-cash' })),
  profitAndLoss: vi.fn(),
}))

vi.mock('@/server/modules/accounting/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/modules/accounting/service')>()
  return {
    ...actual,
    getAccountingFlags: vi.fn(async () => ({
      module: state.module,
      studentLedger: false,
      approvals: state.approvals,
      whatsappReceipts: false,
      fiscalYearStartMonth: 4,
    })),
    accountingEnvSwitches: vi.fn(() => ({ module: true, studentLedger: false, approvals: state.envApprovals, whatsappReceipts: false })),
    assertPostingAllowed: mocks.assertPostingAllowed,
    saveAccountingSettings: mocks.saveAccountingSettings,
  }
})
vi.mock('@/server/audit', () => ({ audit: mocks.audit }))
vi.mock('@/server/numbering', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/numbering')>()
  let n = 0
  return { ...actual, nextDocumentNumber: vi.fn(async () => `EXP-${++n}`) }
})
vi.mock('@/server/modules/accounts/posting', () => ({
  postExpenseInTransaction: mocks.postExpenseInTransaction,
  reverseExpenseInTransaction: mocks.reverseExpenseInTransaction,
  syncExpenseLedger: vi.fn(async () => undefined),
}))
vi.mock('@/server/modules/accounts/chart', () => ({ loadResolver: mocks.loadResolver }))
vi.mock('@/server/modules/accounts/service', () => ({ profitAndLoss: mocks.profitAndLoss }))

const FINAL = 'expense_approval.approve_final'
const ALL = ['expenses.manage', 'expense_approval.validate', 'expense_approval.approve_department', 'expense_approval.approve_finance', FINAL]

function ctxWith(userId: string, permissions: string[], db: Record<string, unknown> = {}) {
  const can = (p: string) => permissions.includes(p)
  return {
    user: { userId, firstName: userId, lastName: 'X', roleKeys: [] },
    tenant: { id: 't1', currency: 'INR' },
    can,
    canAny: (...ps: string[]) => ps.some(can),
    require: (p: string) => {
      if (!can(p)) throw new Error(`Missing permission: ${p}`)
    },
    db,
  } as never
}

const d = (iso: string) => new Date(`${iso}T00:00:00Z`)

function request(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r1', tenantId: 't1', number: 'EAR-2026-27-0001', title: 'Plumbing repair', headId: 'h1', amountMinor: 450_000,
    expenseDate: d('2026-10-01'), paymentMode: 'CASH', vendor: 'Raj Plumbers', referenceNo: null, notes: null, cashAccountId: null,
    receiptKey: null, receiptName: null, receiptMime: null, status: 'PENDING_FINAL', cycle: 1, createdById: 'creator',
    createdByLabel: 'Creator', submittedAt: new Date(), expenseId: null, postedAt: null, reversedAt: null, idempotencyKey: null,
    ...overrides,
  }
}

const SIGNED_BEFORE_FINAL = [
  { cycle: 1, action: 'VALIDATE', actorId: 'v' },
  { cycle: 1, action: 'APPROVE_L1', actorId: 'l1' },
  { cycle: 1, action: 'APPROVE_L2', actorId: 'l2' },
]

/** A fake database whose transactions run one at a time, like row locks on the request. */
function fakeDb(initial: Record<string, unknown>, opts: { autoPost?: boolean; steps?: typeof SIGNED_BEFORE_FINAL } = {}) {
  const row = { ...initial }
  const log: string[] = []
  const tx = {
    $queryRawUnsafe: vi.fn(async () => [{ id: row.id }]),
    expenseApprovalRequest: {
      findFirstOrThrow: vi.fn(async () => ({ ...row })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        log.push(`request.update:${String(data.status)}`)
        Object.assign(row, data)
        return { ...row }
      }),
    },
    expenseApprovalStep: {
      findMany: vi.fn(async () => opts.steps ?? SIGNED_BEFORE_FINAL),
      create: vi.fn(async ({ data }: { data: { action: string } }) => {
        log.push(`step:${data.action}`)
        return data
      }),
    },
    expenseHead: { findFirst: vi.fn(async () => ({ id: 'h1', name: 'Repairs', isActive: true, category: 'MAINTENANCE', nature: 'INDIRECT' })) },
    schoolExpense: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        log.push('expense.create')
        return { id: 'e1', ...data }
      }),
      findFirst: vi.fn(async () => ({ id: 'e1', deletedAt: null })),
      update: vi.fn(async () => {
        log.push('expense.softDelete')
        return { id: 'e1' }
      }),
    },
  }
  let chain = Promise.resolve()
  const db = {
    expenseApprovalRequest: { findFirst: vi.fn(async () => ({ ...initial })), count: vi.fn(async () => 0) },
    ledgerSettings: { findFirst: vi.fn(async () => ({ autoPostExpenses: opts.autoPost ?? true })) },
    $transaction: vi.fn((fn: (t: typeof tx) => Promise<unknown>) => {
      const run = chain.then(() => fn(tx))
      chain = run.then(() => undefined, () => undefined)
      return run
    }),
  }
  mocks.postExpenseInTransaction.mockImplementation(async () => {
    log.push('journal.post')
    return { id: 'j1', number: 'JV-0001' }
  })
  return { db, tx, row, log }
}

beforeEach(() => {
  state.module = true
  state.approvals = true
  state.envApprovals = true
  vi.clearAllMocks()
})

describe('final approval posts atomically', () => {
  it('creates the expense, posts its journal, moves to POSTED and records the step in one transaction', async () => {
    const svc = await import('@/server/modules/accounting/expense-approval-service')
    const { db, tx, row, log } = fakeDb(request())
    const result = await svc.transitionExpenseRequest(ctxWith('principal', [FINAL], db), 'r1', { action: 'approve', expectedStatus: 'PENDING_FINAL' })

    expect(db.$transaction).toHaveBeenCalledTimes(1)
    expect(log).toEqual(['expense.create', 'journal.post', 'request.update:POSTED', 'step:APPROVE_FINAL'])
    expect(mocks.postExpenseInTransaction).toHaveBeenCalledWith(tx, 't1', expect.anything(), 'e1', { id: 'principal', label: 'principal X' })
    expect(tx.schoolExpense.create.mock.calls[0]![0].data).toMatchObject({ amountMinor: 450_000, recordedById: 'creator', headId: 'h1' })
    expect(row).toMatchObject({ status: 'POSTED', expenseId: 'e1' })
    expect(row.postedAt).toBeInstanceOf(Date)
    expect(result).toMatchObject({ expenseId: 'e1', journalNumber: 'JV-0001' })
    expect(mocks.audit).toHaveBeenCalledTimes(1)
  })

  it('changes nothing when posting fails, leaving it at final approval', async () => {
    const svc = await import('@/server/modules/accounting/expense-approval-service')
    const { db, tx, row } = fakeDb(request())
    mocks.postExpenseInTransaction.mockRejectedValueOnce(new Error('ledger unavailable'))
    await expect(svc.transitionExpenseRequest(ctxWith('principal', [FINAL], db), 'r1', { action: 'approve' })).rejects.toThrow('ledger unavailable')
    expect(tx.expenseApprovalRequest.update).not.toHaveBeenCalled()
    expect(tx.expenseApprovalStep.create).not.toHaveBeenCalled()
    expect(row.status).toBe('PENDING_FINAL')
    expect(mocks.audit).not.toHaveBeenCalled()
  })

  it('checks the lock date inside the transaction before creating anything', async () => {
    const svc = await import('@/server/modules/accounting/expense-approval-service')
    const { db, tx } = fakeDb(request())
    mocks.assertPostingAllowed.mockRejectedValueOnce(Object.assign(new Error('Books are locked'), { status: 409 }))
    await expect(svc.transitionExpenseRequest(ctxWith('principal', [FINAL], db), 'r1', { action: 'approve' })).rejects.toThrow('Books are locked')
    expect(tx.schoolExpense.create).not.toHaveBeenCalled()
  })

  it('refuses final approval while automatic expense posting is off', async () => {
    const svc = await import('@/server/modules/accounting/expense-approval-service')
    const { db } = fakeDb(request(), { autoPost: false })
    await expect(svc.transitionExpenseRequest(ctxWith('principal', [FINAL], db), 'r1', { action: 'approve' })).rejects.toMatchObject({ status: 409 })
    expect(db.$transaction).not.toHaveBeenCalled()
  })
})

describe('duplicate and concurrent approvals', () => {
  it('posts once when two final approvers click at the same moment', async () => {
    const svc = await import('@/server/modules/accounting/expense-approval-service')
    const { db, tx } = fakeDb(request())
    const results = await Promise.allSettled([
      svc.transitionExpenseRequest(ctxWith('p1', [FINAL], db), 'r1', { action: 'approve', expectedStatus: 'PENDING_FINAL' }),
      svc.transitionExpenseRequest(ctxWith('p2', [FINAL], db), 'r1', { action: 'approve', expectedStatus: 'PENDING_FINAL' }),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
    expect(failed.reason).toMatchObject({ status: 409 })
    expect(tx.schoolExpense.create).toHaveBeenCalledTimes(1)
    expect(mocks.postExpenseInTransaction).toHaveBeenCalledTimes(1)
  })

  it('refuses a repeated approval of an already posted expense even without the expected status', async () => {
    const svc = await import('@/server/modules/accounting/expense-approval-service')
    const { db, tx } = fakeDb(request({ status: 'POSTED', expenseId: 'e1', postedAt: new Date() }))
    await expect(svc.transitionExpenseRequest(ctxWith('principal', [FINAL], db), 'r1', { action: 'approve' })).rejects.toMatchObject({ status: 409 })
    expect(tx.schoolExpense.create).not.toHaveBeenCalled()
  })
})

describe('unauthorised transitions', () => {
  it('rejects a person without the stage permission', async () => {
    const svc = await import('@/server/modules/accounting/expense-approval-service')
    const { db, tx } = fakeDb(request())
    await expect(svc.transitionExpenseRequest(ctxWith('l2b', ['expense_approval.approve_finance'], db), 'r1', { action: 'approve' })).rejects.toMatchObject({ status: 403 })
    expect(tx.schoolExpense.create).not.toHaveBeenCalled()
    expect(tx.expenseApprovalRequest.update).not.toHaveBeenCalled()
  })

  it('rejects the creator, and a person who already signed this submission', async () => {
    const svc = await import('@/server/modules/accounting/expense-approval-service')
    const { db, tx } = fakeDb(request())
    await expect(svc.transitionExpenseRequest(ctxWith('creator', ALL, db), 'r1', { action: 'approve' })).rejects.toMatchObject({ status: 403 })
    await expect(svc.transitionExpenseRequest(ctxWith('l2', ALL, db), 'r1', { action: 'approve' })).rejects.toMatchObject({ status: 403 })
    expect(tx.schoolExpense.create).not.toHaveBeenCalled()
  })

  it('needs remarks to return a request', async () => {
    const svc = await import('@/server/modules/accounting/expense-approval-service')
    const { db, tx } = fakeDb(request())
    await expect(svc.transitionExpenseRequest(ctxWith('principal', [FINAL], db), 'r1', { action: 'return' })).rejects.toMatchObject({ status: 400 })
    expect(tx.expenseApprovalRequest.update).not.toHaveBeenCalled()
  })

  it('records actor, remarks and both statuses on every transition', async () => {
    const svc = await import('@/server/modules/accounting/expense-approval-service')
    const { db, tx } = fakeDb(request({ status: 'PENDING_L1' }), { steps: [{ cycle: 1, action: 'VALIDATE', actorId: 'v' }] })
    await svc.transitionExpenseRequest(ctxWith('l1', ['expense_approval.approve_department'], db), 'r1', { action: 'return', remarks: 'Attach the quotation' })
    expect(tx.expenseApprovalStep.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'RETURN', fromStatus: 'PENDING_L1', toStatus: 'RETURNED', actorId: 'l1', actorLabel: 'l1 X', remarks: 'Attach the quotation', cycle: 1 }),
    })
    expect(mocks.postExpenseInTransaction).not.toHaveBeenCalled()
  })

  it('reverses a posted expense with a reversing entry, never by deleting the journal', async () => {
    const svc = await import('@/server/modules/accounting/expense-approval-service')
    const { db, row, log } = fakeDb(request({ status: 'POSTED', expenseId: 'e1', postedAt: new Date() }))
    await svc.transitionExpenseRequest(ctxWith('principal', [FINAL], db), 'r1', { action: 'reverse', remarks: 'Paid twice' })
    expect(log).toEqual(['expense.softDelete', 'request.update:REVERSED', 'step:REVERSE'])
    expect(mocks.reverseExpenseInTransaction).toHaveBeenCalledTimes(1)
    expect(row.reversedAt).toBeInstanceOf(Date)
  })
})

describe('workflow switch and the standard expense path', () => {
  it('does not accept new requests while the workflow is off', async () => {
    state.approvals = false
    const svc = await import('@/server/modules/accounting/expense-approval-service')
    await expect(svc.createExpenseRequest(ctxWith('u1', ['expenses.manage']), { title: 'Chalk', headId: 'h1', amount: 100, expenseDate: '2026-10-01' }))
      .rejects.toMatchObject({ status: 403, code: 'FEATURE_DISABLED' })
  })

  it('needs accounts.manage, the deployment switch and no in-flight requests to change the switch', async () => {
    const svc = await import('@/server/modules/accounting/expense-approval-service')
    const db = { expenseApprovalRequest: { count: vi.fn(async () => 2) }, ledgerSettings: { findFirst: vi.fn(async () => ({ autoPostExpenses: true })) } }
    await expect(svc.setApprovalWorkflow(ctxWith('u1', ['accounts.view'], db), { enabled: true })).rejects.toMatchObject({ status: 403 })
    state.envApprovals = false
    await expect(svc.setApprovalWorkflow(ctxWith('u1', ['accounts.manage'], db), { enabled: true })).rejects.toMatchObject({ status: 409 })
    state.envApprovals = true
    await expect(svc.setApprovalWorkflow(ctxWith('u1', ['accounts.manage'], db), { enabled: false })).rejects.toMatchObject({ status: 409 })
    expect(mocks.saveAccountingSettings).not.toHaveBeenCalled()
    await svc.setApprovalWorkflow(ctxWith('u1', ['accounts.manage'], db), { enabled: true })
    expect(mocks.saveAccountingSettings).toHaveBeenCalledWith(expect.anything(), { approvalWorkflowEnabled: true })
  })

  it('refuses to switch on while automatic expense posting is off', async () => {
    const svc = await import('@/server/modules/accounting/expense-approval-service')
    const db = { ledgerSettings: { findFirst: vi.fn(async () => ({ autoPostExpenses: false })) } }
    await expect(svc.setApprovalWorkflow(ctxWith('u1', ['accounts.manage'], db), { enabled: true })).rejects.toMatchObject({ status: 409 })
  })

  it('sends direct expense creation through approval while the workflow is on', async () => {
    const { createExpense } = await import('@/server/modules/finance/expenses')
    const db = { schoolExpense: { findFirst: vi.fn(), create: vi.fn() }, $transaction: vi.fn() }
    await expect(createExpense(ctxWith('u1', ['expenses.manage'], db), { title: 'Chalk', headId: 'h1', amount: 10_000, expenseDate: '2026-10-01', paymentMode: 'CASH' }))
      .rejects.toMatchObject({ status: 409 })
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('does not let an approved expense be edited or deleted outside the workflow', async () => {
    const { deleteExpense, updateExpense } = await import('@/server/modules/finance/expenses')
    const update = vi.fn()
    const db = {
      schoolExpense: { findFirst: vi.fn(async () => ({ id: 'e1', headId: 'h1', deletedAt: null })), update },
      expenseApprovalRequest: { findFirst: vi.fn(async () => ({ number: 'EAR-2026-27-0001' })) },
    }
    const ctx = ctxWith('u1', ['expenses.manage'], db)
    await expect(updateExpense(ctx, { id: 'e1', title: 'Changed', headId: 'h1', amount: 10_000, expenseDate: '2026-10-01', paymentMode: 'CASH' })).rejects.toMatchObject({ status: 409 })
    await expect(deleteExpense(ctx, 'e1')).rejects.toMatchObject({ status: 409 })
    expect(update).not.toHaveBeenCalled()
  })
})

describe('provisional profit and loss', () => {
  it('adds submitted-but-unposted expenses once each, mapped to their ledgers, without touching the actuals', async () => {
    const svc = await import('@/server/modules/accounting/expense-approval-service')
    const actual = { incomeMinor: 1_000_000, directMinor: 100_000, indirectMinor: 100_000, surplusMinor: 800_000, directExpenses: [], indirectExpenses: [], income: [] }
    mocks.profitAndLoss.mockResolvedValue(actual)
    const findMany = vi.fn(async (_args: unknown) => [
      request({ id: 'a', status: 'SUBMITTED', amountMinor: 30_000, headId: 'h1' }),
      request({ id: 'b', status: 'PENDING_FINAL', amountMinor: 20_000, headId: 'h2' }),
    ])
    const db = {
      expenseApprovalRequest: { findMany },
      expenseHead: { findMany: vi.fn(async () => [
        { id: 'h1', category: 'MAINTENANCE', account: { id: 'acc-repairs', isActive: true } },
        { id: 'h2', category: 'OTHER', account: { id: 'acc-old', isActive: false } },
      ]) },
      ledgerAccount: { findMany: vi.fn(async () => [
        { id: 'acc-repairs', code: '5200', name: 'Repairs', expenseNature: 'INDIRECT' },
        { id: 'acc-fallback', code: '5900', name: 'Other expenses', expenseNature: 'INDIRECT' },
      ]) },
    }
    const result = await svc.provisionalProfitAndLoss(ctxWith('u1', ['accounts.view'], db), { from: '2026-04-01', to: '2027-03-31' })
    expect(findMany.mock.calls[0]![0]).toMatchObject({ where: { status: { in: ['SUBMITTED', 'PENDING_L1', 'PENDING_L2', 'PENDING_FINAL'] }, expenseId: null } })
    expect(result.actual).toBe(actual)
    expect(result.projection.items.map((i) => [i.requestId, i.accountId])).toEqual([['a', 'acc-repairs'], ['b', 'acc-fallback']])
    expect(result.projection).toMatchObject({ provisionalMinor: 50_000, actualSurplusMinor: 800_000, projectedSurplusMinor: 750_000, varianceMinor: -50_000 })
  })
})
