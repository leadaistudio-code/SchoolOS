/** Client-safe expense option lists — keep out of server modules that pull next/headers. */

export const EXPENSE_CATEGORIES = [
  { value: 'SALARY', label: 'Salary & wages' },
  { value: 'UTILITIES', label: 'Utilities (power, water, internet)' },
  { value: 'MAINTENANCE', label: 'Maintenance & repairs' },
  { value: 'SUPPLIES', label: 'Supplies & stationery' },
  { value: 'TRANSPORT', label: 'Transport & fuel' },
  { value: 'FOOD', label: 'Food & canteen' },
  { value: 'EVENTS', label: 'Events & functions' },
  { value: 'ADMIN', label: 'Admin & office' },
  { value: 'ACADEMIC', label: 'Academic materials' },
  { value: 'OTHER', label: 'Other' },
] as const

export const EXPENSE_PAYMENT_MODES = [
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'CARD', label: 'Card' },
  { value: 'OTHER', label: 'Other' },
] as const

export type ExpenseCategoryValue = (typeof EXPENSE_CATEGORIES)[number]['value']
export type ExpensePaymentModeValue = (typeof EXPENSE_PAYMENT_MODES)[number]['value']

export function categoryLabel(value: string) {
  return EXPENSE_CATEGORIES.find((c) => c.value === value)?.label ?? value
}

export function paymentModeLabel(value: string) {
  return EXPENSE_PAYMENT_MODES.find((m) => m.value === value)?.label ?? value
}
