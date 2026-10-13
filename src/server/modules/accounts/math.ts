/** A desired journal line before it is written: one side only, minor units. */
export type DraftLine = {
  accountId: string
  debitMinor: number
  creditMinor: number
  memo?: string | null
}

/**
 * Splits `amount` across weights so the parts always sum back to `amount`
 * exactly (largest-remainder rounding). Non-positive weights get nothing; if
 * every weight is zero the whole amount lands on `fallbackIndex`.
 */
export function splitByWeights(amount: number, weights: number[], fallbackIndex = 0): number[] {
  const parts = weights.map(() => 0)
  if (weights.length === 0 || amount === 0) return parts
  const clean = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0))
  const total = clean.reduce((s, w) => s + w, 0)
  if (total <= 0) {
    parts[Math.min(Math.max(fallbackIndex, 0), parts.length - 1)] = amount
    return parts
  }
  const sign = amount < 0 ? -1 : 1
  const abs = Math.abs(amount)
  const raw = clean.map((w) => (abs * w) / total)
  const floors = raw.map((r) => Math.floor(r))
  let remainder = abs - floors.reduce((s, f) => s + f, 0)
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (const { i } of order) {
    if (remainder <= 0) break
    floors[i] = (floors[i] ?? 0) + 1
    remainder--
  }
  return floors.map((f) => f * sign)
}

/**
 * Merges lines per account into one net debit or credit, drops zero lines and
 * sorts debits first so two equivalent drafts compare equal.
 */
export function normalizeLines(lines: DraftLine[]): DraftLine[] {
  const net = new Map<string, { amount: number; memo: string | null }>()
  for (const line of lines) {
    const current = net.get(line.accountId) ?? { amount: 0, memo: null }
    current.amount += line.debitMinor - line.creditMinor
    current.memo = current.memo ?? line.memo ?? null
    net.set(line.accountId, current)
  }
  return [...net.entries()]
    .filter(([, v]) => v.amount !== 0)
    .map(([accountId, v]) => ({
      accountId,
      debitMinor: v.amount > 0 ? v.amount : 0,
      creditMinor: v.amount < 0 ? -v.amount : 0,
      memo: v.memo,
    }))
    .sort((a, b) =>
      (b.debitMinor > 0 ? 1 : 0) - (a.debitMinor > 0 ? 1 : 0) || a.accountId.localeCompare(b.accountId))
}

export function totals(lines: DraftLine[]) {
  const debit = lines.reduce((s, l) => s + l.debitMinor, 0)
  const credit = lines.reduce((s, l) => s + l.creditMinor, 0)
  return { debit, credit, balanced: debit === credit }
}

/** True when two drafts post the same amounts to the same accounts. */
export function sameLines(a: DraftLine[], b: DraftLine[]): boolean {
  const x = normalizeLines(a)
  const y = normalizeLines(b)
  if (x.length !== y.length) return false
  return x.every((line, i) => {
    const other = y[i]
    return !!other
      && other.accountId === line.accountId
      && other.debitMinor === line.debitMinor
      && other.creditMinor === line.creditMinor
  })
}

export function reverseLines(lines: DraftLine[]): DraftLine[] {
  return lines.map((l) => ({ ...l, debitMinor: l.creditMinor, creditMinor: l.debitMinor }))
}

export type InvoiceShape = {
  lateFeeMinor: number
  lines: { feeHeadId: string | null; label: string; amountMinor: number; discountMinor: number; taxPercent: number }[]
}

export type IncomeSlice = { feeHeadId: string | null; label: string; amountMinor: number; isLateFee: boolean }

/**
 * Distributes an amount paid against one invoice across its fee heads in the
 * proportion each line contributes to the invoice total; late fee is its own
 * slice. Rounding residue lands on the largest line so slices sum exactly.
 */
export function splitInvoiceAmount(invoice: InvoiceShape, amountMinor: number): IncomeSlice[] {
  const slices: Omit<IncomeSlice, 'amountMinor'>[] = invoice.lines.map((l) => ({
    feeHeadId: l.feeHeadId,
    label: l.label,
    isLateFee: false,
  }))
  const weights = invoice.lines.map((l) => {
    const net = Math.max(0, l.amountMinor - l.discountMinor)
    return net + Math.round((net * (l.taxPercent || 0)) / 100)
  })
  if (invoice.lateFeeMinor > 0) {
    slices.push({ feeHeadId: null, label: 'Late fee', isLateFee: true })
    weights.push(invoice.lateFeeMinor)
  }
  if (slices.length === 0) return [{ feeHeadId: null, label: 'Fees', amountMinor, isLateFee: false }]
  const largest = weights.reduce((best, w, i) => (w > (weights[best] ?? 0) ? i : best), 0)
  const parts = splitByWeights(amountMinor, weights, largest)
  return slices
    .map((s, i) => ({ ...s, amountMinor: parts[i] ?? 0 }))
    .filter((s) => s.amountMinor !== 0)
}

/** Debit-positive balance shown on the account's natural side. */
export function naturalBalance(type: string, debitPositiveMinor: number): number {
  return type === 'ASSET' || type === 'EXPENSE' ? debitPositiveMinor : -debitPositiveMinor
}
