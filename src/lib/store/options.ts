export const STORE_CATEGORIES = [
  { value: 'BOOKS', label: 'Books', prefix: 'BK', colour: '#6366f1' },
  { value: 'STATIONERY', label: 'Stationery', prefix: 'ST', colour: '#0ea5e9' },
  { value: 'UNIFORM', label: 'Uniform & dress', prefix: 'UN', colour: '#10b981' },
  { value: 'SHOES', label: 'Shoes', prefix: 'SH', colour: '#f59e0b' },
  { value: 'BAGS', label: 'School bags', prefix: 'BG', colour: '#ec4899' },
  { value: 'ACCESSORIES', label: 'Accessories (belt, tie, ID)', prefix: 'AC', colour: '#8b5cf6' },
  { value: 'SPORTS', label: 'Sports kit', prefix: 'SP', colour: '#14b8a6' },
  { value: 'OTHER', label: 'Other', prefix: 'OT', colour: '#64748b' },
] as const

export type StoreCategoryValue = (typeof STORE_CATEGORIES)[number]['value']

export const storeCategory = (value: string) =>
  STORE_CATEGORIES.find((c) => c.value === value) ?? STORE_CATEGORIES[STORE_CATEGORIES.length - 1]!

export const STORE_PAYMENT_MODES = [
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'CARD', label: 'Card' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'CHEQUE', label: 'Cheque' },
] as const

export const storePaymentLabel = (value: string) =>
  value === 'CREDIT'
    ? 'On credit (vendor bill)'
    : value === 'FEE_ACCOUNT'
      ? 'Added to fees'
      : STORE_PAYMENT_MODES.find((m) => m.value === value)?.label ?? value

export const GST_RATES = [0, 5, 12, 18, 28] as const

export const ADJUSTMENT_REASONS = {
  OUT: ['Damaged', 'Lost / missing', 'Stock count shortage', 'Returned to vendor', 'Issued free (staff / scholarship)'],
  IN: ['Stock count excess', 'Found', 'Returned by customer (no bill)', 'Received free / donated'],
} as const

export const MOVEMENT_LABELS: Record<string, { label: string; tone: 'success' | 'danger' | 'info' | 'warning' | 'neutral' }> = {
  OPENING: { label: 'Opening stock', tone: 'info' },
  PURCHASE: { label: 'Stock in', tone: 'success' },
  SALE: { label: 'Sale', tone: 'neutral' },
  SALE_RETURN: { label: 'Bill voided', tone: 'warning' },
  ADJUSTMENT_IN: { label: 'Adjustment +', tone: 'success' },
  ADJUSTMENT_OUT: { label: 'Adjustment −', tone: 'danger' },
}

/**
 * One bill line. Store prices include GST (MRP style), so tax is carved out of
 * the amount the customer pays rather than added on top.
 */
export function priceLine(input: { quantity: number; unitPriceMinor: number; discountMinor?: number; taxPercent: number }) {
  const gross = Math.max(0, input.quantity) * Math.max(0, input.unitPriceMinor)
  const discount = Math.min(Math.max(0, Math.round(input.discountMinor ?? 0)), gross)
  const amount = gross - discount
  const tax = input.taxPercent > 0 ? Math.round((amount * input.taxPercent) / (100 + input.taxPercent)) : 0
  return { gross, discount, amount, tax, net: amount - tax }
}

/** Weighted average cost after receiving `inQty` units at `inCost`. */
export function weightedAverageCost(onHand: number, avgCost: number, inQty: number, inCost: number) {
  const base = Math.max(0, onHand)
  if (base + inQty <= 0) return Math.max(0, Math.round(inCost))
  return Math.round((base * avgCost + inQty * inCost) / (base + inQty))
}

export type StockState = 'OUT' | 'LOW' | 'OK'

export function stockState(quantity: number, reorderLevel: number): StockState {
  if (quantity <= 0) return 'OUT'
  if (quantity <= reorderLevel) return 'LOW'
  return 'OK'
}

/** Full item label used on bills: "Shirt (Size 32)". */
export function itemLabel(item: { name: string; variant?: string | null }) {
  return item.variant ? `${item.name} (${item.variant})` : item.name
}
