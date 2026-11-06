import Link from 'next/link'
import { Banknote, Building2, TrendingUp, Users } from 'lucide-react'
import { presetRange } from '@/lib/periods'
import { cn, formatMoney, formatNumber } from '@/lib/utils'
import { ColorTile } from '@/components/dashboard/color-tiles'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Totals, TrendMonth } from '@/server/modules/group/figures'

export const PERIODS = [
  { key: 'month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'fy', label: 'This financial year' },
] as const

export function resolvePeriod(raw: string | undefined) {
  const period = PERIODS.find((p) => p.key === raw) ?? PERIODS[0]
  return { ...period, range: presetRange(period.key)! }
}

export function PeriodTabs({ base, active }: { base: string; active: string }) {
  return (
    <nav className="flex flex-wrap gap-1 rounded-[var(--radius-sm)] bg-surface-2 p-1 text-sm" aria-label="Period">
      {PERIODS.map((p) => (
        <Link
          key={p.key}
          href={`${base}?period=${p.key}`}
          aria-current={p.key === active ? 'page' : undefined}
          className={cn(
            'rounded-[var(--radius-sm)] px-3 py-1.5 font-medium',
            p.key === active ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink',
          )}
        >
          {p.label}
        </Link>
      ))}
    </nav>
  )
}

export function HeadlineTiles({ total, periodLabel, schools }: { total: Totals; periodLabel: string; schools?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <ColorTile
        label="Students"
        value={formatNumber(total.students)}
        sub={`${formatNumber(total.admissions)} admitted · ${periodLabel.toLowerCase()}`}
        tone="students"
        icon={<Users className="size-5" aria-hidden />}
      />
      <ColorTile
        label="Staff"
        value={formatNumber(total.staff)}
        sub={`${formatNumber(total.teachingStaff)} teaching · ${formatNumber(total.otherStaff)} other`}
        tone="staff"
        icon={<Building2 className="size-5" aria-hidden />}
      />
      <ColorTile
        label="Income"
        value={formatMoney(total.incomeMinor)}
        sub={schools ? `${periodLabel} · ${schools} schools` : periodLabel}
        tone="fees"
        icon={<Banknote className="size-5" aria-hidden />}
      />
      <ColorTile
        label={total.profitMinor < 0 ? 'Loss' : 'Profit'}
        value={formatMoney(Math.abs(total.profitMinor))}
        sub={total.marginPct === null ? 'No income in this period' : `${total.marginPct}% of income`}
        tone={total.profitMinor < 0 ? 'overdue' : 'attendance'}
        icon={<TrendingUp className="size-5" aria-hidden />}
      />
    </div>
  )
}

function Line({ label, value, strong, negative, hint }: { label: string; value: number; strong?: boolean; negative?: boolean; hint?: string }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 py-1.5', strong && 'border-t border-line pt-2 font-semibold text-ink')}>
      <span className={strong ? '' : 'text-ink-muted'}>
        {label}
        {hint ? <span className="block text-xs font-normal text-ink-subtle">{hint}</span> : null}
      </span>
      <span className="tnum">{negative && value > 0 ? `− ${formatMoney(value)}` : formatMoney(value)}</span>
    </div>
  )
}

export function MoneyCard({ total, periodLabel }: { total: Totals; periodLabel: string }) {
  return (
    <Card variant="elevated">
      <CardHeader>
        <CardTitle>Income and costs · {periodLabel}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 text-sm md:grid-cols-2">
        <div>
          <Line label="Fees received" value={total.feesMinor} />
          <Line label="Refunds paid" value={total.refundsMinor} negative />
          <Line label="Other income" value={total.otherIncomeMinor} hint="Uniform, books and store sales" />
          <Line label="Total income" value={total.incomeMinor} strong />
        </div>
        <div>
          <Line label="Direct expenses" value={total.directExpenseMinor} />
          <Line label="Indirect expenses" value={total.indirectExpenseMinor} />
          <Line label="Salaries paid" value={total.salariesMinor} hint="Payslips marked paid in payroll" />
          <Line label="Total costs" value={total.costMinor} strong />
        </div>
        <div className="md:col-span-2 flex items-baseline justify-between rounded-[var(--radius-sm)] bg-surface-2 px-3 py-2 text-base font-semibold">
          <span>{total.profitMinor < 0 ? 'Loss' : 'Profit'}</span>
          <span className={cn('tnum', total.profitMinor < 0 ? 'text-[var(--danger-600,#dc2626)]' : 'text-[var(--success-600,#16a34a)]')}>
            {formatMoney(total.profitMinor)}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

export function BalancesCard({ total }: { total: Totals }) {
  return (
    <Card variant="elevated">
      <CardHeader>
        <CardTitle>Today</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        <Line label="Fees outstanding" value={total.outstandingMinor} />
        <Line label="Of which overdue" value={total.overdueMinor} />
        <Line label="Monthly salary bill" value={total.monthlySalaryBillMinor} hint="Sum of salaries on staff records" />
        <div className="flex items-baseline justify-between py-1.5">
          <span className="text-ink-muted">Student attendance</span>
          <span className="tnum">
            {total.attendancePct === null ? 'Not marked yet' : `${total.attendancePct}% · ${formatNumber(total.attendancePresent)} of ${formatNumber(total.attendanceMarked)}`}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

export function TrendCard({ months }: { months: TrendMonth[] }) {
  const max = Math.max(1, ...months.flatMap((m) => [m.incomeMinor, m.costMinor]))
  return (
    <Card variant="elevated">
      <CardHeader>
        <CardTitle>Month by month · this financial year</CardTitle>
      </CardHeader>
      <CardContent>
        {months.length === 0 ? (
          <p className="text-sm text-ink-muted">No figures yet.</p>
        ) : (
          <>
            <div className="flex h-44 items-end gap-2 sm:gap-3">
              {months.map((m) => (
                <div key={m.key} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-36 w-full items-end justify-center gap-0.5">
                    <div
                      className="w-1/2 max-w-5 rounded-t bg-[var(--chart-fees)]"
                      style={{ height: `${(m.incomeMinor / max) * 100}%` }}
                      title={`Income ${formatMoney(m.incomeMinor)}`}
                    />
                    <div
                      className="w-1/2 max-w-5 rounded-t bg-[var(--chart-overdue)]"
                      style={{ height: `${(m.costMinor / max) * 100}%` }}
                      title={`Costs ${formatMoney(m.costMinor)}`}
                    />
                  </div>
                  <span className="text-[11px] text-ink-subtle">{m.label}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-ink-muted">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-[var(--chart-fees)]" aria-hidden /> Income
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-[var(--chart-overdue)]" aria-hidden /> Costs
              </span>
              <span className="ml-auto tnum">
                Year so far: {formatMoney(months.reduce((s, m) => s + m.profitMinor, 0))}
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

const CATEGORY_LABEL = (c: string) => c.charAt(0) + c.slice(1).toLowerCase().replace(/_/g, ' ')

export function ExpenseCategoriesCard({ rows, periodLabel }: { rows: { category: string; amountMinor: number }[]; periodLabel: string }) {
  const total = rows.reduce((s, r) => s + r.amountMinor, 0)
  return (
    <Card variant="elevated">
      <CardHeader>
        <CardTitle>Where the money went · {periodLabel}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-ink-muted">No expenses recorded in this period.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {rows.map((r) => (
              <li key={r.category}>
                <div className="flex justify-between gap-2">
                  <span className="text-ink-muted">{CATEGORY_LABEL(r.category)}</span>
                  <span className="tnum">{formatMoney(r.amountMinor)}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full bg-[var(--chart-overdue)]" style={{ width: `${(r.amountMinor / total) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-ink-subtle">Recorded expenses only; salaries paid through payroll are shown separately.</p>
      </CardContent>
    </Card>
  )
}
