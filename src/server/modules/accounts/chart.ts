import type { ExpenseNature, LedgerAccountType, LedgerMapKind } from '@prisma/client'
import { tenantDb, type TenantClient } from '@/server/db/tenant-client'

type ChartSeed = {
  systemKey: string
  code: string
  name: string
  type: LedgerAccountType
  description?: string
  expenseNature?: ExpenseNature
}

export const EXPENSE_CATEGORIES = [
  'SALARY', 'UTILITIES', 'MAINTENANCE', 'SUPPLIES', 'TRANSPORT',
  'FOOD', 'EVENTS', 'ADMIN', 'ACADEMIC', 'OTHER',
] as const

export const COLLECTION_MODES = [
  'CASH', 'CHEQUE', 'BANK_TRANSFER', 'CARD', 'UPI', 'NET_BANKING', 'WALLET', 'ONLINE', 'OTHER',
] as const

/** Accounts the posting engine relies on. Schools can rename them or add more. */
export const DEFAULT_CHART: ChartSeed[] = [
  { systemKey: 'CASH', code: '1001', name: 'Cash in Hand', type: 'ASSET' },
  { systemKey: 'BANK', code: '1002', name: 'Bank Account', type: 'ASSET', description: 'Cheques, UPI, cards and online fee collections' },
  { systemKey: 'ADVANCE_FEES', code: '2001', name: 'Advance Fees Received', type: 'LIABILITY', description: 'Fees received before they are billed' },
  { systemKey: 'SECURITY_DEPOSIT', code: '2002', name: 'Security Deposits (Refundable)', type: 'LIABILITY' },
  { systemKey: 'OPENING_EQUITY', code: '3001', name: 'Capital / Opening Balance', type: 'EQUITY' },
  { systemKey: 'TUITION_INCOME', code: '4001', name: 'Tuition Fee Income', type: 'INCOME' },
  { systemKey: 'ADMISSION_INCOME', code: '4002', name: 'Admission & Registration Fees', type: 'INCOME' },
  { systemKey: 'TRANSPORT_INCOME', code: '4003', name: 'Transport Fee Income', type: 'INCOME' },
  { systemKey: 'EXAM_INCOME', code: '4004', name: 'Exam Fee Income', type: 'INCOME' },
  { systemKey: 'LATE_FEE_INCOME', code: '4005', name: 'Late Fee & Fines', type: 'INCOME' },
  { systemKey: 'OTHER_FEE_INCOME', code: '4009', name: 'Other Fee Income', type: 'INCOME' },
  { systemKey: 'EXP_SALARY', code: '5001', name: 'Salaries & Wages', type: 'EXPENSE' },
  { systemKey: 'EXP_UTILITIES', code: '5002', name: 'Electricity & Utilities', type: 'EXPENSE' },
  { systemKey: 'EXP_MAINTENANCE', code: '5003', name: 'Repairs & Maintenance', type: 'EXPENSE' },
  { systemKey: 'EXP_SUPPLIES', code: '5004', name: 'Stationery & Supplies', type: 'EXPENSE' },
  { systemKey: 'EXP_TRANSPORT', code: '5005', name: 'Transport & Fuel', type: 'EXPENSE' },
  { systemKey: 'EXP_FOOD', code: '5006', name: 'Food & Canteen', type: 'EXPENSE' },
  { systemKey: 'EXP_EVENTS', code: '5007', name: 'Events & Functions', type: 'EXPENSE' },
  { systemKey: 'EXP_ADMIN', code: '5008', name: 'Administrative Expenses', type: 'EXPENSE' },
  { systemKey: 'EXP_ACADEMIC', code: '5009', name: 'Academic Expenses', type: 'EXPENSE' },
  { systemKey: 'EXP_OTHER', code: '5099', name: 'Miscellaneous Expenses', type: 'EXPENSE' },
  { systemKey: 'STORE_STOCK', code: '1003', name: 'Store Stock (Inventory)', type: 'ASSET', description: 'School store goods on hand at average cost' },
  { systemKey: 'GST_PAYABLE', code: '2003', name: 'GST Payable (Store Sales)', type: 'LIABILITY' },
  { systemKey: 'SALARY_DEDUCTIONS_PAYABLE', code: '2004', name: 'Salary Deductions Payable', type: 'LIABILITY', description: 'PF, TDS and other amounts withheld from salaries until paid over' },
  { systemKey: 'STORE_SALES_INCOME', code: '4006', name: 'School Store Sales', type: 'INCOME', description: 'Books, uniforms and stationery sold, net of GST' },
  { systemKey: 'EXP_STORE_COGS', code: '5010', name: 'Cost of Store Goods Sold', type: 'EXPENSE', expenseNature: 'DIRECT' },
  { systemKey: 'EXP_STOCK_LOSS', code: '5011', name: 'Stock Shortage & Damage', type: 'EXPENSE', expenseNature: 'INDIRECT' },
]

/** Income account a fee head posts to when the school has not mapped it. */
export function defaultFeeHeadKey(name: string, isDeposit = false): string {
  if (isDeposit) return 'SECURITY_DEPOSIT'
  const n = name.toLowerCase()
  if (/tuition/.test(n)) return 'TUITION_INCOME'
  if (/transport|\bbus\b|\bvan\b|conveyance/.test(n)) return 'TRANSPORT_INCOME'
  if (/admission|registration|enrol/.test(n)) return 'ADMISSION_INCOME'
  if (/exam/.test(n)) return 'EXAM_INCOME'
  if (/late|fine|penalt/.test(n)) return 'LATE_FEE_INCOME'
  return 'OTHER_FEE_INCOME'
}

export function defaultModeKey(mode: string): string {
  return mode === 'CASH' || mode === 'OTHER' ? 'CASH' : 'BANK'
}

export function defaultExpenseKey(category: string): string {
  return `EXP_${(EXPENSE_CATEGORIES as readonly string[]).includes(category) ? category : 'OTHER'}`
}

/** Creates any missing system accounts. Safe to call repeatedly. */
export async function ensureChart(tenantId: string, db: TenantClient = tenantDb(tenantId)) {
  const existing = await db.ledgerAccount.findMany({ select: { systemKey: true, code: true } })
  const keys = new Set(existing.map((a) => a.systemKey).filter(Boolean))
  const codes = new Set(existing.map((a) => a.code))
  const missing = DEFAULT_CHART.filter((seed) => !keys.has(seed.systemKey))
  if (missing.length === 0) return
  await db.ledgerAccount.createMany({
    data: missing.map((seed) => {
      let code = seed.code
      for (let n = 1; codes.has(code); n++) code = `${seed.code}-${n}`
      codes.add(code)
      return { tenantId, ...seed, code }
    }),
    skipDuplicates: true,
  })
}

/**
 * Resolves the ledger account for fee heads, collection modes and expense
 * categories: explicit map first, then the default system account.
 */
export async function loadResolver(tenantId: string, db: TenantClient = tenantDb(tenantId)) {
  await ensureChart(tenantId, db)
  const [accounts, maps, heads] = await Promise.all([
    db.ledgerAccount.findMany({ select: { id: true, systemKey: true } }),
    db.ledgerAccountMap.findMany({ select: { kind: true, localKey: true, accountId: true } }),
    db.feeHead.findMany({ select: { id: true, name: true, isDeposit: true } }),
  ])
  const accountIds = new Set(accounts.map((a) => a.id))
  const bySystem = new Map(accounts.filter((a) => a.systemKey).map((a) => [a.systemKey as string, a.id]))
  const mapOf = new Map(
    maps.filter((m) => accountIds.has(m.accountId)).map((m) => [`${m.kind}:${m.localKey}`, m.accountId]),
  )
  const headOf = new Map(heads.map((h) => [h.id, h]))

  const system = (key: string): string => {
    const id = bySystem.get(key)
    if (!id) throw new Error(`Ledger system account ${key} is missing`)
    return id
  }
  const mapped = (kind: LedgerMapKind, key: string) => mapOf.get(`${kind}:${key}`)

  return {
    system,
    feeHead(feeHeadId: string | null, label: string, isLateFee = false): string {
      if (isLateFee) return system('LATE_FEE_INCOME')
      if (feeHeadId) {
        const explicit = mapped('FEE_HEAD', feeHeadId)
        if (explicit) return explicit
        const head = headOf.get(feeHeadId)
        if (head) return system(defaultFeeHeadKey(head.name, head.isDeposit))
      }
      return system(defaultFeeHeadKey(label))
    },
    mode(mode: string): string {
      return mapped('PAYMENT_MODE', mode) ?? system(defaultModeKey(mode))
    },
    expense(category: string): string {
      return mapped('EXPENSE_CATEGORY', category) ?? system(defaultExpenseKey(category))
    },
  }
}

export type AccountResolver = Awaited<ReturnType<typeof loadResolver>>
