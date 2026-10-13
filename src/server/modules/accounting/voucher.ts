import type { JournalVoucherType } from '@prisma/client'
import { MAX_MINOR, isValidMinor } from './money'
import { isIsoDate } from './fiscal-year'

/**
 * Voucher kinds in TallyPrime terms. The ledger's `JournalVoucherType` has only
 * JOURNAL, RECEIPT, PAYMENT and CONTRA, so the remaining kinds are stored as
 * JOURNAL and told apart by their source type until that enum is extended.
 */
export const VOUCHER_KINDS = [
  'RECEIPT',
  'PAYMENT',
  'CONTRA',
  'JOURNAL',
  'FEE_DEMAND',
  'PURCHASE',
  'DEBIT_NOTE',
  'DEPRECIATION',
  'REVERSAL',
] as const

export type VoucherKind = (typeof VOUCHER_KINDS)[number]

export function ledgerVoucherType(kind: VoucherKind): JournalVoucherType {
  if (kind === 'RECEIPT' || kind === 'PAYMENT' || kind === 'CONTRA') return kind
  return 'JOURNAL'
}

export type VoucherLineDraft = {
  accountId: string
  debitMinor: number
  creditMinor: number
  memo?: string | null
}

export type VoucherDraft = {
  kind: VoucherKind
  /** Calendar day, "YYYY-MM-DD". */
  date: string
  narration: string
  reference?: string | null
  /** Makes posting idempotent; the same key never posts twice. */
  idempotencyKey?: string | null
  lines: VoucherLineDraft[]
}

export type VoucherIssueCode =
  | 'INVALID_KIND'
  | 'INVALID_DATE'
  | 'NARRATION_REQUIRED'
  | 'NARRATION_TOO_LONG'
  | 'INVALID_IDEMPOTENCY_KEY'
  | 'TOO_FEW_LINES'
  | 'MISSING_ACCOUNT'
  | 'UNKNOWN_ACCOUNT'
  | 'INVALID_AMOUNT'
  | 'ZERO_LINE'
  | 'BOTH_SIDES'
  | 'NO_DEBIT'
  | 'NO_CREDIT'
  | 'UNBALANCED'
  | 'TOTAL_TOO_LARGE'

export type VoucherIssue = { code: VoucherIssueCode; message: string; line?: number }

export type VoucherCheck =
  | { ok: true; totalMinor: number }
  | { ok: false; issues: VoucherIssue[] }

const KEY = /^[A-Za-z0-9:_.-]{8,120}$/

/**
 * Checks a voucher before it is posted. It never repairs a voucher: an
 * unbalanced draft is rejected, not topped up with a balancing line.
 *
 * `accountIds` must be the posting school's own active accounts. An id from
 * any other school is reported as unknown, which is what stops a voucher
 * reaching across tenants by guessing ids.
 */
export function validateVoucher(draft: VoucherDraft, accountIds: ReadonlySet<string>): VoucherCheck {
  const issues: VoucherIssue[] = []

  if (!(VOUCHER_KINDS as readonly string[]).includes(draft.kind)) {
    issues.push({ code: 'INVALID_KIND', message: 'Unknown voucher type.' })
  }
  if (typeof draft.date !== 'string' || !isIsoDate(draft.date)) {
    issues.push({ code: 'INVALID_DATE', message: 'Enter a valid voucher date.' })
  }
  const narration = (draft.narration ?? '').trim()
  if (!narration) issues.push({ code: 'NARRATION_REQUIRED', message: 'Add a narration explaining the voucher.' })
  if (narration.length > 500) issues.push({ code: 'NARRATION_TOO_LONG', message: 'Narration must be 500 characters or fewer.' })
  if (draft.idempotencyKey != null && !KEY.test(draft.idempotencyKey)) {
    issues.push({ code: 'INVALID_IDEMPOTENCY_KEY', message: 'Idempotency key must be 8-120 letters, digits or : _ . -' })
  }

  const lines = Array.isArray(draft.lines) ? draft.lines : []
  if (lines.length < 2) issues.push({ code: 'TOO_FEW_LINES', message: 'A voucher needs at least one debit and one credit line.' })

  let debit = 0
  let credit = 0
  let debitLines = 0
  let creditLines = 0
  lines.forEach((l, i) => {
    const line = i + 1
    if (!l.accountId) issues.push({ code: 'MISSING_ACCOUNT', message: `Line ${line}: choose a ledger account.`, line })
    else if (!accountIds.has(l.accountId)) issues.push({ code: 'UNKNOWN_ACCOUNT', message: `Line ${line}: that ledger account is not available.`, line })

    if (!isValidMinor(l.debitMinor) || !isValidMinor(l.creditMinor)) {
      issues.push({ code: 'INVALID_AMOUNT', message: `Line ${line}: amounts must be whole paise, zero or more.`, line })
      return
    }
    if (l.debitMinor > 0 && l.creditMinor > 0) {
      issues.push({ code: 'BOTH_SIDES', message: `Line ${line}: put the amount on the debit or the credit side, not both.`, line })
      return
    }
    if (l.debitMinor === 0 && l.creditMinor === 0) {
      issues.push({ code: 'ZERO_LINE', message: `Line ${line}: enter an amount.`, line })
      return
    }
    debit += l.debitMinor
    credit += l.creditMinor
    if (l.debitMinor > 0) debitLines++
    else creditLines++
  })

  if (lines.length >= 2 && debitLines === 0) issues.push({ code: 'NO_DEBIT', message: 'A voucher needs at least one debit line.' })
  if (lines.length >= 2 && creditLines === 0) issues.push({ code: 'NO_CREDIT', message: 'A voucher needs at least one credit line.' })
  if (debit !== credit) {
    issues.push({ code: 'UNBALANCED', message: `Debits (${debit} paise) and credits (${credit} paise) must be equal.` })
  }
  if (debit > MAX_MINOR) issues.push({ code: 'TOTAL_TOO_LARGE', message: 'The voucher total is larger than the books can hold.' })

  return issues.length ? { ok: false, issues } : { ok: true, totalMinor: debit }
}
