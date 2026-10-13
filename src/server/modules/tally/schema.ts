import { z } from 'zod'

export const PAIRING_CODE_TTL_MINUTES = 30
export const CONNECTOR_OFFLINE_AFTER_SEC = 5 * 60
export const TOKEN_PREFIX = 'mcv_tally_'

export const upsertIntegrationSchema = z.object({
  enabled: z.boolean().optional(),
  provider: z.enum(['ERP9', 'PRIME']).optional(),
  mode: z.enum(['CONNECTOR', 'DIRECT']).optional(),
  companyName: z.string().trim().max(200).nullable().optional(),
  companyGuid: z.string().trim().max(120).nullable().optional(),
  host: z.string().trim().max(200).nullable().optional(),
  port: z.number().int().min(1).max(65535).optional(),
  timeoutMs: z.number().int().min(1000).max(120_000).optional(),
  syncFrequencyMin: z.number().int().min(1).max(24 * 60).optional(),
  autoSyncReceipts: z.boolean().optional(),
  autoSyncExpenses: z.boolean().optional(),
  autoCreateLedgers: z.boolean().optional(),
  autoSyncMasters: z.boolean().optional(),
  testMode: z.boolean().optional(),
  partyModel: z
    .enum(['STUDENT_LEDGER', 'CLASS_LEDGER', 'FEE_CATEGORY_LEDGER', 'CUSTOM'])
    .optional(),
})

export const createPairingSchema = z.object({
  connectorName: z.string().trim().min(1).max(80).default('Tally Connector'),
})

export const pairRequestSchema = z.object({
  code: z.string().trim().min(6).max(32),
  hostname: z.string().trim().max(120).optional(),
  osInfo: z.string().trim().max(120).optional(),
  connectorVersion: z.string().trim().max(40).optional(),
  name: z.string().trim().max(80).optional(),
  tallyHost: z.string().trim().max(120).optional(),
  tallyPort: z.number().int().min(1).max(65535).optional(),
})

export const heartbeatSchema = z.object({
  connectorVersion: z.string().trim().max(40).optional(),
  hostname: z.string().trim().max(120).optional(),
  osInfo: z.string().trim().max(120).optional(),
  pendingJobs: z.number().int().min(0).max(10_000_000).optional(),
  tallyHost: z.string().trim().max(120).optional(),
  tallyPort: z.number().int().min(1).max(65535).optional(),
  tallyReachable: z.boolean().optional(),
  companyName: z.string().trim().max(200).optional().nullable(),
})

export const commandResultSchema = z.object({
  status: z.enum(['SUCCEEDED', 'FAILED']),
  result: z.record(z.string(), z.unknown()).optional().nullable(),
  error: z.string().trim().max(2000).optional().nullable(),
  errorCode: z.string().trim().max(80).optional().nullable(),
})

export const mappingUpsertSchema = z.object({
  kind: z.enum([
    'FEE_HEAD',
    'PAYMENT_MODE',
    'STUDENT',
    'EXPENSE_CATEGORY',
    'VENDOR',
    'COST_CENTRE',
    'VOUCHER_TYPE',
    'INCOME_LEDGER',
  ]),
  localKey: z.string().trim().min(1).max(120),
  localLabel: z.string().trim().max(200).optional().nullable(),
  tallyLedgerName: z.string().trim().min(1).max(200),
  tallyGuid: z.string().trim().max(120).optional().nullable(),
  tallyParent: z.string().trim().max(200).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
})

export const accountingRuleSchema = z.object({
  name: z.string().trim().min(1).max(120),
  paymentMode: z
    .enum(['CASH', 'CHEQUE', 'BANK_TRANSFER', 'CARD', 'UPI', 'NET_BANKING', 'WALLET', 'ONLINE'])
    .nullable()
    .optional(),
  feeHeadId: z.string().trim().max(40).nullable().optional(),
  debitLedgerName: z.string().trim().min(1).max(200),
  creditLedgerName: z.string().trim().max(200).nullable().optional(),
  voucherType: z.string().trim().min(1).max(80).default('Receipt'),
  narrationTemplate: z.string().trim().max(500).nullable().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
})

export function normalisePairingCode(code: string): string {
  return code.replace(/[^A-Z0-9]/gi, '').toUpperCase()
}
