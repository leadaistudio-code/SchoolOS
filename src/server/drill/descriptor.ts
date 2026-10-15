import crypto from 'node:crypto'
import { z } from 'zod'
import { env } from '@/lib/env'

/**
 * What a drill-down link may ask for.
 *
 * Every aggregated figure links to the Ledger Vouchers, Group Summary or
 * register rows that make it up, the way Enter drills down in Tally. The link
 * carries only one of these whitelisted descriptors, signed for one school; the
 * server re-checks permission and tenant scope and recomputes everything, so a
 * descriptor never carries an amount, a query or a free-form filter.
 */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** Groups of the chart of accounts, as Tally names them on the statements. */
export const DRILL_GROUPS = {
  income: { label: 'Income', basis: 'period' },
  direct: { label: 'Direct Expenses', basis: 'period' },
  indirect: { label: 'Indirect Expenses', basis: 'period' },
  expenses: { label: 'Expenses', basis: 'period' },
  assets: { label: 'Assets', basis: 'closing' },
  /** Liabilities, Capital Account and the Income & Expenditure surplus, as on the Balance Sheet. */
  funds: { label: 'Liabilities & Funds', basis: 'closing' },
} as const
export type DrillGroup = keyof typeof DRILL_GROUPS

export const FEE_MODES = ['CASH', 'CHEQUE', 'BANK_TRANSFER', 'CARD', 'UPI', 'NET_BANKING', 'WALLET', 'ONLINE'] as const

export const drillSchema = z.discriminatedUnion('k', [
  /** One ledger: opening B/F, debits, credits and closing. `v` picks the figure the link stood for. */
  z.object({
    k: z.literal('ledger'),
    a: z.string().min(1).max(40),
    f: isoDate.optional(),
    t: isoDate,
    v: z.enum(['period', 'closing']),
  }),
  /** Group Summary: every ledger in the group with its amount, summing to the group total. */
  z.object({
    k: z.literal('group'),
    g: z.enum(Object.keys(DRILL_GROUPS) as [DrillGroup, ...DrillGroup[]]),
    f: isoDate.optional(),
    t: isoDate,
  }),
  /** Gross or net surplus: Income less Direct (less Indirect) Expenses. */
  z.object({ k: z.literal('surplus'), l: z.enum(['gross', 'net']), f: isoDate, t: isoDate }),
  /** Fee receipts, optionally one payment mode. Same definition as the fee reports summary. */
  z.object({ k: z.literal('fee-collected'), f: isoDate.optional(), t: isoDate.optional(), m: z.enum(FEE_MODES).optional() }),
  /** Fee demand raised (invoices issued). */
  z.object({ k: z.literal('fee-billed'), f: isoDate.optional(), t: isoDate.optional() }),
  /** Fee outstanding on invoices issued in the period. */
  z.object({ k: z.literal('fee-outstanding'), f: isoDate.optional(), t: isoDate.optional() }),
])

export type Drill = z.infer<typeof drillSchema>

function signature(tenantId: string, payload: string) {
  return crypto.createHmac('sha256', env().AUTH_SECRET).update(`drill:${tenantId}:${payload}`).digest('base64url').slice(0, 32)
}

/** Opaque, school-bound token for a descriptor. */
export function signDrill(tenantId: string, drill: Drill): string {
  const payload = Buffer.from(JSON.stringify(drillSchema.parse(drill))).toString('base64url')
  return `${payload}.${signature(tenantId, payload)}`
}

/** The descriptor, or null when the token is malformed, tampered with or from another school. */
export function verifyDrill(tenantId: string, token: string | undefined | null): Drill | null {
  if (!token || token.length > 2000) return null
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const payload = token.slice(0, dot)
  const given = Buffer.from(token.slice(dot + 1))
  const expected = Buffer.from(signature(tenantId, payload))
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null
  try {
    const parsed = drillSchema.safeParse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function drillHref(tenantId: string, drill: Drill): string {
  return `/accounts/drill?d=${signDrill(tenantId, drill)}`
}
