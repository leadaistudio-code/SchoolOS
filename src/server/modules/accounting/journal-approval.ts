/**
 * Approval of cost entries before they reach the P&L and balance sheet: the
 * rules, with no database access.
 *
 *   Maker       writes the entry (bill, stock receipt, payroll, journal...)  -> PENDING_CHECK
 *   Checker     validates                                                    -> PENDING_DEPARTMENT or PENDING_ACCOUNTANT
 *   Dept. head  approves (only when the school switches this stage on)       -> PENDING_ACCOUNTANT
 *   Accountant  approves                                                     -> PENDING_OWNER
 *   Owner       final approval                                               -> APPROVED
 *
 * Any stage holder may return the entry to the maker (remarks required). The
 * maker, or anyone who manages accounts, resubmits it unchanged or corrects the
 * source document, which voids it and raises a fresh entry.
 *
 * Separation of duties: the maker never signs, and one person signs at most
 * one stage of a cycle.
 */

import type { JournalApprovalStatus, JournalSourceType, LedgerAccountType } from '@prisma/client'

export type JournalStage = {
  status: JournalApprovalStatus
  label: string
  permission: string
  /** Shown only when the school has switched the department-head stage on. */
  optional: boolean
}

export const JOURNAL_STAGES: JournalStage[] = [
  { status: 'PENDING_CHECK', label: 'Checker', permission: 'expense_approval.validate', optional: false },
  { status: 'PENDING_DEPARTMENT', label: 'Department head', permission: 'expense_approval.approve_department', optional: true },
  { status: 'PENDING_ACCOUNTANT', label: 'Accountant', permission: 'expense_approval.approve_finance', optional: false },
  { status: 'PENDING_OWNER', label: 'Owner', permission: 'expense_approval.approve_final', optional: false },
]

export const PENDING_STATUSES: JournalApprovalStatus[] = JOURNAL_STAGES.map((s) => s.status)

export const JOURNAL_STATUS_LABEL: Record<JournalApprovalStatus, string> = {
  APPROVED: 'Approved',
  PENDING_CHECK: 'With Checker',
  PENDING_DEPARTMENT: 'With Department head',
  PENDING_ACCOUNTANT: 'With Accountant',
  PENDING_OWNER: 'With Owner',
  RETURNED: 'Returned to maker',
  VOID: 'Void',
}

/** Sources whose entries cost the school money. Depreciation has its own approval. */
const COST_SOURCES = new Set<JournalSourceType>(['EXPENSE', 'PURCHASE_VOUCHER', 'STORE_PURCHASE', 'PAYROLL', 'FIXED_ASSET'])

/** Whether a new (non-reversal) entry must wait for approval while the workflow is on. */
export function isCostEntry(sourceType: JournalSourceType, accountTypes: LedgerAccountType[]): boolean {
  if (COST_SOURCES.has(sourceType)) return true
  return sourceType === 'MANUAL' && accountTypes.includes('EXPENSE')
}

/**
 * Status for a new entry. A reversal follows its original: reversing an
 * approved entry is approved at once, reversing one that never counted voids both.
 */
export function initialStatus(input: {
  workflowOn: boolean
  preApproved?: boolean
  sourceType: JournalSourceType
  accountTypes: LedgerAccountType[]
  reversalOf?: JournalApprovalStatus | null
}): JournalApprovalStatus {
  if (input.reversalOf) return input.reversalOf === 'APPROVED' ? 'APPROVED' : 'VOID'
  if (!input.workflowOn || input.preApproved) return 'APPROVED'
  return isCostEntry(input.sourceType, input.accountTypes) ? 'PENDING_CHECK' : 'APPROVED'
}

export function stagesInUse(departmentStage: boolean): JournalStage[] {
  return JOURNAL_STAGES.filter((s) => !s.optional || departmentStage)
}

export function stageOfStatus(status: JournalApprovalStatus): JournalStage | null {
  return JOURNAL_STAGES.find((s) => s.status === status) ?? null
}

export function nextStatus(status: JournalApprovalStatus, departmentStage: boolean): JournalApprovalStatus {
  const stages = stagesInUse(departmentStage)
  const at = stages.findIndex((s) => s.status === status)
  if (at < 0) {
    // Switched off while an entry sat with the department head: it moves on to the accountant.
    if (status === 'PENDING_DEPARTMENT') return 'PENDING_ACCOUNTANT'
    throw new Error(`No stage for ${status}`)
  }
  return stages[at + 1]?.status ?? 'APPROVED'
}

export type JournalAction = 'approve' | 'return' | 'resubmit'

export type JournalActor = { id: string; can: (permission: string) => boolean }
export type JournalState = { status: JournalApprovalStatus; cycle: number; createdById: string | null }
export type JournalStepRecord = { cycle: number; action: string; actorId: string | null }

export class JournalApprovalError extends Error {
  constructor(readonly code: 'NOT_ALLOWED' | 'FORBIDDEN' | 'SEPARATION_OF_DUTIES' | 'REMARKS_REQUIRED' | 'STALE', message: string) {
    super(message)
  }
}

export type JournalTransition = { to: JournalApprovalStatus; step: string; newCycle: boolean; approves: boolean }

export function planJournalAction(input: {
  entry: JournalState
  steps: JournalStepRecord[]
  actor: JournalActor
  action: JournalAction
  remarks?: string | null
  departmentStage: boolean
  expected?: JournalApprovalStatus | null
}): JournalTransition {
  const { entry, actor, action } = input
  const remarks = (input.remarks ?? '').trim()
  const need = (ok: boolean, code: JournalApprovalError['code'], message: string) => {
    if (!ok) throw new JournalApprovalError(code, message)
  }
  if (input.expected && input.expected !== entry.status) {
    throw new JournalApprovalError('STALE', `This entry is now "${JOURNAL_STATUS_LABEL[entry.status]}"; refresh and try again`)
  }
  const isMaker = !!entry.createdById && entry.createdById === actor.id

  if (action === 'resubmit') {
    need(entry.status === 'RETURNED', 'NOT_ALLOWED', 'Only a returned entry can be resubmitted')
    need(isMaker || actor.can('accounts.manage'), 'FORBIDDEN', 'Only the maker or an accounts manager can resubmit this entry')
    return { to: 'PENDING_CHECK', step: 'RESUBMIT', newCycle: true, approves: false }
  }

  const stage = stageOfStatus(entry.status)
  need(!!stage, 'NOT_ALLOWED', `An entry that is "${JOURNAL_STATUS_LABEL[entry.status]}" has no approval pending`)
  need(actor.can(stage!.permission), 'FORBIDDEN', `You are not authorised to sign as ${stage!.label}`)
  need(!isMaker, 'SEPARATION_OF_DUTIES', 'You made this entry, so you cannot approve or return it')

  if (action === 'return') {
    need(remarks.length >= 3, 'REMARKS_REQUIRED', 'Say why you are returning it (at least 3 characters)')
    return { to: 'RETURNED', step: 'RETURN', newCycle: false, approves: false }
  }

  const signed = input.steps.some((s) => s.cycle === entry.cycle && s.actorId === actor.id && s.action.startsWith('APPROVE'))
  need(!signed, 'SEPARATION_OF_DUTIES', 'You already signed an earlier stage of this entry; another authorised person must sign this one')
  const to = nextStatus(entry.status, input.departmentStage)
  return { to, step: `APPROVE_${entry.status.replace('PENDING_', '')}`, newCycle: false, approves: to === 'APPROVED' }
}

export function journalActions(
  entry: JournalState,
  steps: JournalStepRecord[],
  actor: JournalActor,
  departmentStage: boolean,
): JournalAction[] {
  return (['approve', 'return', 'resubmit'] as JournalAction[]).filter((action) => {
    try {
      planJournalAction({ entry, steps, actor, action, remarks: 'xxx', departmentStage })
      return true
    } catch {
      return false
    }
  })
}
