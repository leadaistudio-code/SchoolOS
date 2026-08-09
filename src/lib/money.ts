/**
 * Money.
 *
 * Everything is an integer in MINOR units (paise). No float ever touches an
 * amount: 0.1 + 0.2 is not 0.3, and a school reconciling a fee register will
 * find that out eventually. Percentages are the only place division happens,
 * and the rounding rule there is stated explicitly.
 */

export type Minor = number

export function assertMinor(value: number, label = 'amount'): Minor {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer number of paise, got ${value}`)
  }
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} is out of safe integer range`)
  }
  return value
}

export function sumMinor(values: Minor[]): Minor {
  return values.reduce((total, v) => total + v, 0)
}

/**
 * Percentage of an amount, rounded HALF UP to the nearest paisa.
 *
 * Half-up is the convention Indian schools use on fee slips, and rounding
 * consistently in one direction means a 33.33% concession on three equal
 * instalments cannot silently produce a one-paisa discrepancy against the
 * total.
 */
export function percentOf(amount: Minor, percent: number): Minor {
  assertMinor(amount)
  if (percent < 0 || percent > 100) {
    throw new Error(`percent must be between 0 and 100, got ${percent}`)
  }
  return Math.round((amount * percent) / 100)
}

export type ConcessionKindValue = 'PERCENT' | 'FLAT'

/**
 * Applies a concession to a line amount.
 *
 * A discount can never exceed the amount it applies to: a 5,000 scholarship
 * against a 3,000 line reduces it to zero, it does not create a 2,000 credit.
 */
export function applyConcession(
  amount: Minor,
  kind: ConcessionKindValue,
  value: number,
): { discount: Minor; net: Minor } {
  assertMinor(amount)
  const raw = kind === 'PERCENT' ? percentOf(amount, value) : assertMinor(value, 'concession')
  const discount = Math.max(0, Math.min(raw, amount))
  return { discount, net: amount - discount }
}

export type AllocationTarget = { id: string; balanceMinor: Minor }
export type Allocation = { id: string; amountMinor: Minor }

/**
 * Splits a payment across outstanding invoices, oldest first.
 *
 * Two properties matter and are asserted by tests:
 *  - the allocated total never exceeds the payment;
 *  - no invoice is allocated more than it owes.
 *
 * Whatever is left over after every invoice is settled is returned as
 * `unallocatedMinor` — an advance payment is a real thing, and silently
 * dropping it would lose the school money.
 */
export function allocatePayment(
  amountMinor: Minor,
  targets: AllocationTarget[],
): { allocations: Allocation[]; unallocatedMinor: Minor } {
  assertMinor(amountMinor, 'payment')
  if (amountMinor <= 0) throw new Error('A payment must be greater than zero')

  let remaining = amountMinor
  const allocations: Allocation[] = []

  for (const target of targets) {
    if (remaining <= 0) break
    const owed = Math.max(0, target.balanceMinor)
    if (owed === 0) continue

    const take = Math.min(owed, remaining)
    allocations.push({ id: target.id, amountMinor: take })
    remaining -= take
  }

  return { allocations, unallocatedMinor: remaining }
}

export type LateFeeRule = {
  graceDays: number
  kind: ConcessionKindValue
  value: number
  perDay: boolean
  maxMinor: Minor | null
}

/**
 * Late fee for one overdue invoice.
 *
 * Days are counted from the end of the grace period, never from the due date
 * itself, so a rule with 5 grace days charges nothing on day 5.
 */
export function lateFeeFor(
  balanceMinor: Minor,
  daysOverdue: number,
  rule: LateFeeRule,
): Minor {
  assertMinor(balanceMinor)
  if (balanceMinor <= 0) return 0

  const chargeableDays = daysOverdue - rule.graceDays
  if (chargeableDays <= 0) return 0

  const perOccurrence =
    rule.kind === 'PERCENT' ? percentOf(balanceMinor, rule.value) : assertMinor(rule.value)

  const raw = rule.perDay ? perOccurrence * chargeableDays : perOccurrence
  return rule.maxMinor === null ? raw : Math.min(raw, rule.maxMinor)
}

export type InvoiceTotals = {
  subtotalMinor: Minor
  discountMinor: Minor
  taxMinor: Minor
  lateFeeMinor: Minor
  totalMinor: Minor
}

/**
 * Recomputes invoice totals from its lines. The stored totals are derived
 * values; this is the single place that derives them, so an invoice can always
 * be rebuilt from its lines and proved correct.
 */
export function computeInvoiceTotals(
  lines: { amountMinor: Minor; discountMinor: Minor; taxPercent: number }[],
  lateFeeMinor: Minor = 0,
): InvoiceTotals {
  const subtotalMinor = sumMinor(lines.map((l) => assertMinor(l.amountMinor)))
  const discountMinor = sumMinor(lines.map((l) => assertMinor(l.discountMinor)))
  const taxMinor = sumMinor(
    lines.map((l) => percentOf(Math.max(0, l.amountMinor - l.discountMinor), l.taxPercent)),
  )

  return {
    subtotalMinor,
    discountMinor,
    taxMinor,
    lateFeeMinor,
    totalMinor: subtotalMinor - discountMinor + taxMinor + lateFeeMinor,
  }
}

export type InvoiceStatusValue =
  | 'DRAFT'
  | 'ISSUED'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'OVERDUE'
  | 'CANCELLED'

/**
 * Derives invoice status from money and time, so status can never disagree
 * with the balance it is supposed to describe.
 */
export function deriveInvoiceStatus(params: {
  totalMinor: Minor
  paidMinor: Minor
  dueOn: Date
  now?: Date
  cancelled?: boolean
}): InvoiceStatusValue {
  if (params.cancelled) return 'CANCELLED'

  const balance = params.totalMinor - params.paidMinor
  if (balance <= 0) return 'PAID'

  const now = params.now ?? new Date()
  if (params.paidMinor > 0) {
    return params.dueOn < now ? 'OVERDUE' : 'PARTIALLY_PAID'
  }
  return params.dueOn < now ? 'OVERDUE' : 'ISSUED'
}

/** Refundable remainder of a payment. Never negative, never above the payment. */
export function refundableMinor(paymentMinor: Minor, alreadyRefundedMinor: Minor): Minor {
  return Math.max(0, assertMinor(paymentMinor) - assertMinor(alreadyRefundedMinor))
}
