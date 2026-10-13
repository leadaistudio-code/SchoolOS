/**
 * Tally provider contract.
 *
 * MyCampusView talks to Tally through this interface so Tally.ERP 9 and a
 * future TallyPrime provider can share the same finance integration surface.
 * Implementations must only speak XML-over-HTTP (or connector-relayed XML) —
 * never open the Tally company database file.
 */

export type TallyCompanyInfo = {
  name: string
  guid?: string | null
  startingFrom?: string | null
}

export type TallyLedgerInfo = {
  name: string
  parent?: string | null
  guid?: string | null
  isParty?: boolean
  closingBalance?: number | null
}

export type TallyVoucherLine = {
  ledgerName: string
  amount: number
  isDebit: boolean
  costCentre?: string | null
}

export type TallyVoucherDraft = {
  voucherType: string
  date: string // YYYYMMDD
  narration: string
  partyLedgerName?: string | null
  lines: TallyVoucherLine[]
  /** Used for idempotent remote reference when Tally supports it. */
  remoteReference?: string | null
}

export type TallyVoucherResult = {
  ok: boolean
  voucherNumber?: string | null
  masterId?: string | null
  errorCode?: string | null
  errorMessage?: string | null
  raw?: string | null
}

export type TallyConnectionResult = {
  ok: boolean
  companies: TallyCompanyInfo[]
  companyLoaded: boolean
  selectedCompany?: string | null
  errorCode?: string | null
  errorMessage?: string | null
  latencyMs?: number
}

export type TallyTransport = {
  /** POST an XML envelope; returns response body text. */
  postXml: (xml: string, timeoutMs: number) => Promise<{ status: number; body: string; latencyMs: number }>
}

export interface ITallyProvider {
  readonly kind: 'ERP9' | 'PRIME'
  testConnection(companyName?: string | null): Promise<TallyConnectionResult>
  listCompanies(): Promise<TallyCompanyInfo[]>
  listLedgers(companyName: string): Promise<TallyLedgerInfo[]>
  createLedger(input: {
    companyName: string
    name: string
    parent: string
  }): Promise<{ ok: boolean; errorMessage?: string | null }>
  createVoucher(input: {
    companyName: string
    voucher: TallyVoucherDraft
  }): Promise<TallyVoucherResult>
}

export const TALLY_ERROR = {
  OFFLINE: 'TALLY_OFFLINE',
  ENDPOINT_UNREACHABLE: 'TALLY_ENDPOINT_UNREACHABLE',
  COMPANY_NOT_LOADED: 'COMPANY_NOT_LOADED',
  COMPANY_NOT_FOUND: 'COMPANY_NOT_FOUND',
  LEDGER_NOT_FOUND: 'LEDGER_NOT_FOUND',
  LEDGER_MAPPING_MISSING: 'LEDGER_MAPPING_MISSING',
  VOUCHER_CREATION_FAILED: 'VOUCHER_CREATION_FAILED',
  DUPLICATE_TRANSACTION: 'DUPLICATE_TRANSACTION',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  TEST_MODE: 'TEST_MODE_BLOCKED',
  SSRF_BLOCKED: 'SSRF_BLOCKED',
  TIMEOUT: 'TALLY_TIMEOUT',
  PARSE_ERROR: 'TALLY_PARSE_ERROR',
} as const

export type TallyErrorCode = (typeof TALLY_ERROR)[keyof typeof TALLY_ERROR]

export function tallyErrorMessage(code: string): string {
  switch (code) {
    case TALLY_ERROR.OFFLINE:
      return 'Unable to connect to Tally. Please ensure Tally.ERP 9 is running and the configured port is accessible.'
    case TALLY_ERROR.ENDPOINT_UNREACHABLE:
      return 'Tally endpoint is not reachable.'
    case TALLY_ERROR.COMPANY_NOT_LOADED:
      return 'Tally is running but no company is currently loaded.'
    case TALLY_ERROR.COMPANY_NOT_FOUND:
      return 'Configured company was not found.'
    case TALLY_ERROR.LEDGER_NOT_FOUND:
      return 'The configured Tally ledger could not be found.'
    case TALLY_ERROR.LEDGER_MAPPING_MISSING:
      return 'No Tally ledger is mapped to this fee head or payment mode.'
    case TALLY_ERROR.VOUCHER_CREATION_FAILED:
      return 'Tally rejected the voucher. Review the accounting details.'
    case TALLY_ERROR.DUPLICATE_TRANSACTION:
      return 'This transaction has already been synchronized with Tally.'
    case TALLY_ERROR.TEST_MODE:
      return 'Tally is in test mode — live vouchers are not posted.'
    case TALLY_ERROR.SSRF_BLOCKED:
      return 'Direct Tally host is not allowed from this deployment.'
    case TALLY_ERROR.TIMEOUT:
      return 'Tally did not respond before the timeout.'
    case TALLY_ERROR.PARSE_ERROR:
      return 'Tally returned a response that could not be parsed.'
    default:
      return 'Tally integration error.'
  }
}
