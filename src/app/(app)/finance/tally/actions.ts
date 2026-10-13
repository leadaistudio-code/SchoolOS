'use server'

import { revalidatePath } from 'next/cache'
import { requireContext } from '@/server/context'
import { updateTallyIntegration } from '@/server/modules/tally/settings'
import {
  createTallyPairingCode,
  revokeTallyConnector,
} from '@/server/modules/tally/pairing'
import { enqueueTallyCommand } from '@/server/modules/tally/commands'
import {
  autoAcceptSuggestions,
  ensureDefaultPaymentModeRules,
  mapFeeHeadToLedger,
  setRuleDebitLedger,
  upsertMapping,
} from '@/server/modules/tally/mappings'
import { runReconciliation } from '@/server/modules/tally/reconciliation'
import { requestTrialBalance } from '@/server/modules/tally/trial-balance'
import { retryFailedSyncs, syncPaymentToTally } from '@/server/modules/tally/receipts'

export async function saveTallySettingsAction(formData: FormData) {
  const ctx = await requireContext('settings.integrations')
  await updateTallyIntegration(ctx, {
    enabled: formData.get('enabled') === 'on',
    testMode: formData.get('testMode') === 'on',
    autoSyncReceipts: formData.get('autoSyncReceipts') === 'on',
    autoCreateLedgers: formData.get('autoCreateLedgers') === 'on',
    companyName: String(formData.get('companyName') || '') || null,
    mode: String(formData.get('mode') || 'CONNECTOR') as 'CONNECTOR' | 'DIRECT',
    host: String(formData.get('host') || '') || null,
    port: Number(formData.get('port') || 9000),
    partyModel: String(formData.get('partyModel') || 'STUDENT_LEDGER') as
      | 'STUDENT_LEDGER'
      | 'CLASS_LEDGER'
      | 'FEE_CATEGORY_LEDGER'
      | 'CUSTOM',
  })
  revalidatePath('/settings/tally')
  revalidatePath('/finance/tally')
}

export async function createPairingAction(formData: FormData) {
  const ctx = await requireContext('settings.integrations')
  await createTallyPairingCode(ctx, {
    connectorName: String(formData.get('connectorName') || 'Tally Connector'),
  })
  revalidatePath('/settings/tally')
}

export async function revokeConnectorAction(formData: FormData) {
  const ctx = await requireContext('settings.integrations')
  await revokeTallyConnector(ctx, String(formData.get('connectorId')))
  revalidatePath('/settings/tally')
}

export async function enqueueSyncAction(formData: FormData) {
  const ctx = await requireContext('fees.tally_manage')
  const type = String(formData.get('type') || 'TEST_CONNECTION') as
    | 'TEST_CONNECTION'
    | 'LIST_COMPANIES'
    | 'FETCH_MASTERS'
  await enqueueTallyCommand(ctx, { type })
  revalidatePath('/finance/tally')
  revalidatePath('/settings/tally')
}

export async function acceptMappingAction(formData: FormData) {
  const ctx = await requireContext('fees.tally_manage')
  await upsertMapping(ctx, {
    kind: 'FEE_HEAD',
    localKey: String(formData.get('localKey')),
    localLabel: String(formData.get('localLabel') || ''),
    tallyLedgerName: String(formData.get('tallyLedgerName')),
  })
  revalidatePath('/finance/tally')
}

export async function mapFeeHeadAction(formData: FormData) {
  const ctx = await requireContext('fees.tally_manage')
  await mapFeeHeadToLedger(ctx, {
    feeHeadId: String(formData.get('feeHeadId') || ''),
    ledgerName: String(formData.get('tallyLedgerName') || ''),
  })
  revalidatePath('/finance/tally')
}

export async function setRuleLedgerAction(formData: FormData) {
  const ctx = await requireContext('fees.tally_manage')
  await setRuleDebitLedger(ctx, {
    ruleId: String(formData.get('ruleId') || ''),
    ledgerName: String(formData.get('debitLedgerName') || ''),
  })
  revalidatePath('/finance/tally')
}

export async function requestTrialBalanceAction(formData: FormData) {
  const ctx = await requireContext('fees.tally_manage')
  await requestTrialBalance(ctx, {
    from: String(formData.get('from') || ''),
    to: String(formData.get('to') || ''),
  })
  revalidatePath('/finance/tally/trial-balance')
}

export async function autoMapAction() {
  const ctx = await requireContext('fees.tally_manage')
  await autoAcceptSuggestions(ctx, 92)
  revalidatePath('/finance/tally')
}

export async function seedPaymentRulesAction() {
  const ctx = await requireContext('fees.tally_manage')
  await ensureDefaultPaymentModeRules(ctx)
  revalidatePath('/finance/tally')
}

export async function runReconAction() {
  const ctx = await requireContext('fees.tally_manage')
  await runReconciliation(ctx)
  revalidatePath('/finance/tally')
}

export async function retryFailedAction() {
  const ctx = await requireContext('fees.tally_manage')
  await retryFailedSyncs(ctx)
  revalidatePath('/finance/tally')
}

export async function syncPaymentAction(formData: FormData) {
  const ctx = await requireContext('fees.tally_manage')
  await syncPaymentToTally(ctx, String(formData.get('paymentId')))
  revalidatePath('/finance/tally')
  revalidatePath(`/finance/payments/${String(formData.get('paymentId'))}`)
}
