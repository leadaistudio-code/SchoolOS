import { DEFAULT_FY_START_MONTH } from './fiscal-year'

/** Deployment-wide kill switches, read from the environment. */
export type AccountingEnvSwitches = {
  module: boolean
  studentLedger: boolean
  approvals: boolean
  whatsappReceipts: boolean
}

/** A school's own choices; null when it has never saved accounting settings. */
export type AccountingSettingsRow = {
  studentLedgerEnabled: boolean
  approvalWorkflowEnabled: boolean
  whatsappReceiptsEnabled: boolean
  fiscalYearStartMonth: number
} | null

export type AccountingFlags = {
  module: boolean
  studentLedger: boolean
  approvals: boolean
  whatsappReceipts: boolean
  fiscalYearStartMonth: number
}

export const ACCOUNTING_OFF: AccountingFlags = Object.freeze({
  module: false,
  studentLedger: false,
  approvals: false,
  whatsappReceipts: false,
  fiscalYearStartMonth: DEFAULT_FY_START_MONTH,
})

/**
 * A feature is on only when the deployment allows it, the module itself is on
 * and the school has switched it on. Anything missing means off.
 */
export function resolveAccountingFlags(env: AccountingEnvSwitches, row: AccountingSettingsRow): AccountingFlags {
  if (!env.module) return ACCOUNTING_OFF
  const month = row && Number.isInteger(row.fiscalYearStartMonth) && row.fiscalYearStartMonth >= 1 && row.fiscalYearStartMonth <= 12
    ? row.fiscalYearStartMonth
    : DEFAULT_FY_START_MONTH
  return {
    module: true,
    studentLedger: env.studentLedger && !!row?.studentLedgerEnabled,
    approvals: env.approvals && !!row?.approvalWorkflowEnabled,
    whatsappReceipts: env.whatsappReceipts && !!row?.whatsappReceiptsEnabled,
    fiscalYearStartMonth: month,
  }
}

/**
 * Expense approval: mandatory for every expense when the school has switched it
 * on; otherwise a preparer may send one expense for approval, but only where
 * the deployment allows approvals at all.
 */
export type ApprovalMode = 'mandatory' | 'optional' | 'off'
export function approvalMode(flags: AccountingFlags, deploymentAllowsApprovals: boolean): ApprovalMode {
  if (flags.approvals) return 'mandatory'
  return flags.module && deploymentAllowsApprovals ? 'optional' : 'off'
}
