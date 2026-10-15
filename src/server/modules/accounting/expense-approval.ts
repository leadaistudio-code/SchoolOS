/**
 * Multi-tier expense approval: the rules, with no database access.
 *
 *   Stage 1  DRAFT          creator prepares            -> submit        -> SUBMITTED
 *   Stage 2  SUBMITTED      validator / audit           -> validate      -> PENDING_L1
 *   Stage 3  PENDING_L1     approver L1 (dept. head)    -> approve       -> PENDING_L2
 *   Stage 4  PENDING_L2     approver L2 (finance)       -> approve       -> PENDING_FINAL
 *   Stage 5  PENDING_FINAL  final approver (principal)  -> approve+post  -> POSTED
 *
 * At stages 2-5 the stage's holder may also return it to the creator (RETURNED,
 * remarks required; resubmitting starts a new cycle at stage 2 and clears the
 * earlier sign-offs) or reject it (REJECTED, final, remarks required). The
 * creator may withdraw it while it is a draft, returned, or not yet validated.
 * A posted expense can be reversed by a final approver (remarks required).
 *
 * Separation of duties: the creator never acts at stages 2-5, and one person
 * signs at most one stage of a submission cycle.
 */

export type ApprovalStatus =
  | 'DRAFT' | 'SUBMITTED' | 'PENDING_L1' | 'PENDING_L2' | 'PENDING_FINAL'
  | 'RETURNED' | 'REJECTED' | 'WITHDRAWN' | 'POSTED' | 'REVERSED'

export type ApprovalAction = 'submit' | 'approve' | 'return' | 'reject' | 'withdraw' | 'reverse'

export type StepAction =
  | 'SUBMIT' | 'VALIDATE' | 'APPROVE_L1' | 'APPROVE_L2' | 'APPROVE_FINAL'
  | 'RETURN' | 'REJECT' | 'WITHDRAW' | 'EDIT' | 'REVERSE'

export type StageDef = {
  stage: 2 | 3 | 4 | 5
  status: ApprovalStatus
  label: string
  permission: string
  signature: StepAction
  next: ApprovalStatus
}

export const APPROVAL_STAGES: StageDef[] = [
  { stage: 2, status: 'SUBMITTED', label: 'Validator (audit)', permission: 'expense_approval.validate', signature: 'VALIDATE', next: 'PENDING_L1' },
  { stage: 3, status: 'PENDING_L1', label: 'Approver (department head)', permission: 'expense_approval.approve_department', signature: 'APPROVE_L1', next: 'PENDING_L2' },
  { stage: 4, status: 'PENDING_L2', label: 'Approver (finance officer)', permission: 'expense_approval.approve_finance', signature: 'APPROVE_L2', next: 'PENDING_FINAL' },
  { stage: 5, status: 'PENDING_FINAL', label: 'Final Approver (principal)', permission: 'expense_approval.approve_final', signature: 'APPROVE_FINAL', next: 'POSTED' },
]

/** Stage 1 is whoever prepares the expense. */
export const CREATOR_STAGE_LABEL = 'Creator'

/** Short role names for the stepper and board: Creator, Validator, Approver, Approver, Final Approver. */
export const STAGE_ROLE: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'Creator',
  2: 'Validator',
  3: 'Approver',
  4: 'Approver',
  5: 'Final Approver',
}

export const SIGNATURES: StepAction[] = APPROVAL_STAGES.map((s) => s.signature)

/** Submitted and not yet posted: what "Include provisional" counts. */
export const PROVISIONAL_STATUSES: ApprovalStatus[] = ['SUBMITTED', 'PENDING_L1', 'PENDING_L2', 'PENDING_FINAL']

/** In the pipeline: the workflow cannot be switched off while any request is here. */
export const IN_FLIGHT_STATUSES = PROVISIONAL_STATUSES

export const STATUS_LABEL: Record<ApprovalStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'With Validator',
  PENDING_L1: 'With Approver (department head)',
  PENDING_L2: 'With Approver (finance officer)',
  PENDING_FINAL: 'With Final Approver',
  RETURNED: 'Returned for correction',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
  POSTED: 'Approved and posted',
  REVERSED: 'Reversed',
}

export function stageOf(status: ApprovalStatus): StageDef | null {
  return APPROVAL_STAGES.find((s) => s.status === status) ?? null
}

/** 1-5 while in the pipeline (drafts and returned requests sit with the creator). */
export function stageNumber(status: ApprovalStatus): number | null {
  if (status === 'DRAFT' || status === 'RETURNED') return 1
  return stageOf(status)?.stage ?? null
}

export type ApprovalActor = { id: string; can: (permission: string) => boolean }
export type RequestState = { status: ApprovalStatus; cycle: number; createdById: string | null }
export type StepRecord = { cycle: number; action: string; actorId: string | null }

export type Transition = { to: ApprovalStatus; step: StepAction; remarksRequired: boolean; posts: boolean; newCycle: boolean }

export class ApprovalRuleError extends Error {
  constructor(readonly code: 'NOT_ALLOWED' | 'FORBIDDEN' | 'SEPARATION_OF_DUTIES' | 'REMARKS_REQUIRED' | 'STALE', message: string) {
    super(message)
  }
}

/**
 * Decides whether `actor` may take `action` on a request in its current state,
 * and where it goes. Throws ApprovalRuleError when not.
 * `expected` is the status the actor saw; a mismatch means someone else acted first.
 */
export function planTransition(input: {
  request: RequestState
  steps: StepRecord[]
  actor: ApprovalActor
  action: ApprovalAction
  remarks?: string | null
  expected?: ApprovalStatus | null
}): Transition {
  const { request, actor, action } = input
  const remarks = (input.remarks ?? '').trim()
  if (input.expected && input.expected !== request.status) {
    throw new ApprovalRuleError('STALE', `This expense is now "${STATUS_LABEL[request.status]}"; refresh and try again`)
  }
  const isCreator = !!request.createdById && request.createdById === actor.id
  const need = (ok: boolean, code: ApprovalRuleError['code'], message: string) => {
    if (!ok) throw new ApprovalRuleError(code, message)
  }
  const withRemarks = (t: Omit<Transition, 'remarksRequired'> & { remarksRequired?: boolean }): Transition => {
    const result = { remarksRequired: false, ...t }
    need(!result.remarksRequired || remarks.length >= 3, 'REMARKS_REQUIRED', 'Give remarks of at least 3 characters')
    return result
  }

  switch (action) {
    case 'submit':
      need(request.status === 'DRAFT' || request.status === 'RETURNED', 'NOT_ALLOWED', 'Only a draft or returned expense can be submitted')
      need(isCreator, 'FORBIDDEN', 'Only the person who prepared this expense can submit it')
      return withRemarks({ to: 'SUBMITTED', step: 'SUBMIT', posts: false, newCycle: request.status === 'RETURNED' })

    case 'withdraw':
      need(['DRAFT', 'RETURNED', 'SUBMITTED'].includes(request.status), 'NOT_ALLOWED', 'Only a draft, returned or not-yet-validated expense can be withdrawn')
      need(isCreator, 'FORBIDDEN', 'Only the person who prepared this expense can withdraw it')
      return withRemarks({ to: 'WITHDRAWN', step: 'WITHDRAW', posts: false, newCycle: false })

    case 'reverse':
      need(request.status === 'POSTED', 'NOT_ALLOWED', 'Only a posted expense can be reversed')
      need(actor.can('expense_approval.approve_final'), 'FORBIDDEN', 'Only a final approver can reverse a posted expense')
      return withRemarks({ to: 'REVERSED', step: 'REVERSE', posts: false, newCycle: false, remarksRequired: true })

    case 'approve':
    case 'return':
    case 'reject': {
      const stage = stageOf(request.status)
      need(!!stage, 'NOT_ALLOWED', `An expense that is "${STATUS_LABEL[request.status]}" cannot be ${action === 'approve' ? 'approved' : action === 'return' ? 'returned' : 'rejected'}`)
      const def = stage!
      need(actor.can(def.permission), 'FORBIDDEN', `You are not authorised for stage ${def.stage}: ${def.label}`)
      need(!isCreator, 'SEPARATION_OF_DUTIES', 'You prepared this expense, so you cannot act on it at any approval stage')
      if (action === 'approve') {
        const signed = input.steps.some(
          (s) => s.cycle === request.cycle && s.actorId === actor.id && (SIGNATURES as string[]).includes(s.action),
        )
        need(!signed, 'SEPARATION_OF_DUTIES', 'You have already signed an earlier stage of this expense; another authorised person must sign this one')
        return withRemarks({ to: def.next, step: def.signature, posts: def.next === 'POSTED', newCycle: false })
      }
      if (action === 'return') return withRemarks({ to: 'RETURNED', step: 'RETURN', posts: false, newCycle: false, remarksRequired: true })
      return withRemarks({ to: 'REJECTED', step: 'REJECT', posts: false, newCycle: false, remarksRequired: true })
    }
  }
}

/** The actions `actor` could take now; drives which buttons are shown. */
export function availableActions(request: RequestState, steps: StepRecord[], actor: ApprovalActor): ApprovalAction[] {
  const all: ApprovalAction[] = ['submit', 'approve', 'return', 'reject', 'withdraw', 'reverse']
  return all.filter((action) => {
    try {
      planTransition({ request, steps, actor, action, remarks: 'xxx' })
      return true
    } catch {
      return false
    }
  })
}

// ------------------------------------------------------------------ provisional P&L

export type PlRow = { id: string; code: string; name: string; expenseNature: string | null; amountMinor: number }

export type ProvisionalItem = {
  requestId: string
  number: string
  title: string
  status: ApprovalStatus
  expenseDate: string
  amountMinor: number
  accountId: string
  accountCode: string
  accountName: string
  expenseNature: string | null
}

/**
 * Projected result: the actual P&L plus eligible pending expenses, each counted
 * once (by request id), never written to the ledgers.
 */
export function projectProfitAndLoss(
  actual: { incomeMinor: number; directMinor: number; indirectMinor: number; directExpenses: PlRow[]; indirectExpenses: PlRow[] },
  pending: ProvisionalItem[],
) {
  const seen = new Set<string>()
  const items = pending.filter((p) => {
    if (seen.has(p.requestId) || !PROVISIONAL_STATUSES.includes(p.status) || p.amountMinor <= 0) return false
    seen.add(p.requestId)
    return true
  })
  const isDirect = (nature: string | null) => nature === 'DIRECT'
  const provisionalDirectMinor = items.filter((i) => isDirect(i.expenseNature)).reduce((s, i) => s + i.amountMinor, 0)
  const provisionalIndirectMinor = items.filter((i) => !isDirect(i.expenseNature)).reduce((s, i) => s + i.amountMinor, 0)
  const provisionalMinor = provisionalDirectMinor + provisionalIndirectMinor
  const actualExpenseMinor = actual.directMinor + actual.indirectMinor
  const actualSurplusMinor = actual.incomeMinor - actualExpenseMinor
  const projectedSurplusMinor = actualSurplusMinor - provisionalMinor
  return {
    items,
    provisionalDirectMinor,
    provisionalIndirectMinor,
    provisionalMinor,
    actualIncomeMinor: actual.incomeMinor,
    actualExpenseMinor,
    actualSurplusMinor,
    projectedDirectMinor: actual.directMinor + provisionalDirectMinor,
    projectedIndirectMinor: actual.indirectMinor + provisionalIndirectMinor,
    projectedGrossSurplusMinor: actual.incomeMinor - actual.directMinor - provisionalDirectMinor,
    projectedSurplusMinor,
    varianceMinor: projectedSurplusMinor - actualSurplusMinor,
  }
}
