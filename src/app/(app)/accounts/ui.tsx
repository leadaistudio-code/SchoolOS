import Link from 'next/link'
import {
  ArrowDownLeft,
  ArrowUpRight,
  BookOpen,
  Building,
  Landmark,
  LayoutDashboard,
  ListTree,
  NotebookPen,
  PiggyBank,
  Receipt,
  Scale,
  Settings2,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { ACCENT, StatCard, accentFor } from '@/components/ui/stat-card'
import { Card } from '@/components/ui/card'
import { LinkTabs } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/utils'

const TABS = [
  { href: '/accounts', label: 'Overview', icon: LayoutDashboard },
  { href: '/accounts/chart', label: 'Chart of accounts', icon: ListTree },
  { href: '/accounts/journals', label: 'Journal entries', icon: NotebookPen },
  { href: '/accounts/ledger', label: 'General ledger', icon: BookOpen },
  { href: '/accounts/trial-balance', label: 'Trial balance', icon: Scale },
  { href: '/accounts/profit-loss', label: 'Profit & loss', icon: TrendingUp },
  { href: '/accounts/balance-sheet', label: 'Balance sheet', icon: Landmark },
  { href: '/accounts/settings', label: 'Posting rules', icon: Settings2 },
]

export function AccountsTabs({ active }: { active: string }) {
  return <LinkTabs label="Accounts" items={TABS.map((t) => ({ ...t, active: active === t.href }))} />
}

export function Metric({
  label,
  value,
  hint,
  tone,
  href,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'success' | 'danger'
  /** Drill-down to the entries behind the figure. */
  href?: string
}) {
  const [icon, accent] = metricLook(label, tone)
  return <StatCard label={label} value={value} hint={hint} tone={tone} icon={icon} accent={accent} href={href} />
}

const METRIC_LOOKS: [RegExp, LucideIcon, string][] = [
  [/indirect/i, Building, ACCENT.amber],
  [/direct/i, Target, ACCENT.indigo],
  [/income|receipt|collect/i, TrendingUp, ACCENT.emerald],
  [/expense|payment/i, Receipt, ACCENT.orange],
  [/surplus|deficit|profit/i, PiggyBank, ACCENT.teal],
  [/asset|cash|bank/i, Wallet, ACCENT.sky],
  [/liabilit|capital|fund|equity/i, Landmark, ACCENT.violet],
  [/debit/i, ArrowDownLeft, ACCENT.sky],
  [/credit/i, ArrowUpRight, ACCENT.violet],
  [/difference|balanc|match/i, Scale, ACCENT.pink],
  [/voucher|entr|journal/i, NotebookPen, ACCENT.indigo],
  [/account|ledger/i, ListTree, ACCENT.teal],
]

function metricLook(label: string, tone?: 'success' | 'danger'): [LucideIcon, string] {
  const hit = METRIC_LOOKS.find(([re]) => re.test(label))
  const icon = hit?.[1] ?? Sparkles
  const accent = tone === 'danger' ? ACCENT.rose : (hit?.[2] ?? accentFor(label))
  return [icon, accent]
}

/** GET form for a date range; keeps any extra params as hidden fields. */
export function PeriodFilter({
  from,
  to,
  single,
  extra = {},
  children,
}: {
  from?: string
  to: string
  /** Only an "as of" date (balance sheet). */
  single?: boolean
  extra?: Record<string, string | undefined>
  children?: React.ReactNode
}) {
  return (
    <Card className="no-print p-4">
      <form method="get" className="flex flex-wrap items-end gap-3">
        {Object.entries(extra).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
        {children}
        {single ? null : (
          <label className="block text-sm">
            <span className="text-ink-muted">From</span>
            <Input type="date" name="from" defaultValue={from} required className="mt-1 w-44" />
          </label>
        )}
        <label className="block text-sm">
          <span className="text-ink-muted">{single ? 'As of' : 'To'}</span>
          <Input type="date" name="to" defaultValue={to} required className="mt-1 w-44" />
        </label>
        <Button type="submit" variant="secondary">Apply</Button>
      </form>
    </Card>
  )
}

export function moneyFmt(currency: string) {
  const money = (minor: number) => formatMoney(Math.abs(minor), currency)
  const drCr = (minor: number) => (minor === 0 ? '—' : `${money(minor)} ${minor > 0 ? 'Dr' : 'Cr'}`)
  const signed = (minor: number) => (minor < 0 ? `(${money(minor)})` : money(minor))
  return { money, drCr, signed }
}

export const SOURCE_LABEL: Record<string, string> = {
  MANUAL: 'Manual',
  FEE_PAYMENT: 'Fee receipt',
  FEE_REFUND: 'Fee refund',
  EXPENSE: 'Expense',
  PAYROLL: 'Salary',
  STORE_SALE: 'Store sale',
  STORE_PURCHASE: 'Store purchase',
  STORE_STOCK: 'Stock adjustment',
  PURCHASE_VOUCHER: 'Purchase voucher',
  VENDOR_PAYMENT: 'Vendor payment',
  DEBIT_NOTE: 'Debit note',
  VENDOR_ADJUSTMENT: 'Vendor discount / write-off',
  DEPRECIATION: 'Depreciation',
  FIXED_ASSET: 'Fixed asset',
}

export function sourceHref(sourceType: string, sourceId: string | null): string | null {
  if (!sourceId) return null
  if (sourceType === 'FEE_PAYMENT') return `/finance/payments/${sourceId}`
  if (sourceType === 'EXPENSE') return '/finance/expenses'
  if (sourceType === 'PAYROLL') return '/staff/payroll'
  if (sourceType === 'FIXED_ASSET') return `/accounts/fixed-assets/${sourceId}`
  if (sourceType === 'DEPRECIATION') return `/accounts/fixed-assets/depreciation?run=${sourceId}`
  return null
}

export const APPROVAL_TONE = {
  DRAFT: 'neutral',
  SUBMITTED: 'warning',
  PENDING_L1: 'warning',
  PENDING_L2: 'warning',
  PENDING_FINAL: 'warning',
  RETURNED: 'info',
  REJECTED: 'danger',
  WITHDRAWN: 'neutral',
  POSTED: 'success',
  REVERSED: 'neutral',
} as const

export function isoParam(value: string | undefined, fallback: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback
}
