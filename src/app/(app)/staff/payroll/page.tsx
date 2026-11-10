import { requireContext } from '@/server/context'
import { listPayslips, monthName, payrollMonthPlan, payrollSummary } from '@/server/modules/staff/payroll'
import { formatMoney, formatNumber } from '@/lib/utils'
import { PageHeader } from '@/components/page-header'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, Notice } from '@/components/ui/states'
import { Metric, MetricRow } from '@/components/ui/metric'
import { StaffTabs } from '../tabs'
import { PeriodPicker } from './period-picker'
import { PayrollTable } from './payroll-table'
import { GenerateMonthButton, QuickSalaryButton } from './month-actions'

export const metadata = { title: 'Payroll' }

/**
 * The payroll month.
 *
 * One month at a time, because that is how payroll is actually run and
 * checked: set any missing salaries, create every payslip in one go, review,
 * then pay them together. Single payslips can still be raised from a profile.
 */
export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('staff.payroll')
  const params = await searchParams

  const now = new Date()
  const year = Number(params.year) || now.getFullYear()
  const month = Number(params.month) || now.getMonth() + 1

  const [summary, payslips, plan] = await Promise.all([
    payrollSummary(ctx, year, month),
    listPayslips(ctx, { periodYear: year, periodMonth: month }),
    payrollMonthPlan(ctx, year, month),
  ])

  const canManage = ctx.can('staff.payroll_manage')
  const currency = ctx.tenant.currency
  const money = (minor: number) => formatMoney(minor, currency)
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`

  return (
    <div className="space-y-4">
      <PageHeader
        title="Payroll"
        description={`${monthName(month)} ${year} · ${summary.generated} of ${summary.headcount} payslips generated`}
        breadcrumbs={[{ label: 'Teachers & staff', href: '/staff' }, { label: 'Payroll' }]}
        actions={
          canManage ? (
            <>
              <QuickSalaryButton missing={plan.missingSalary} effectiveFrom={monthStart} monthLabel={`${monthName(month)} ${year}`} />
              <GenerateMonthButton
                year={year}
                month={month}
                monthLabel={monthName(month)}
                readyCount={plan.ready.length}
                readyNetMinor={plan.readyNetMinor}
                missingCount={plan.missingSalary.length}
                currency={currency}
              />
            </>
          ) : null
        }
      />

      {canManage ? (
        <ol className="grid gap-2 text-sm sm:grid-cols-3">
          {[
            { n: 1, title: 'Set salaries', done: plan.missingSalary.length === 0, hint: plan.missingSalary.length ? `${plan.missingSalary.length} staff have no salary` : 'Everyone has a salary' },
            { n: 2, title: 'Create payslips', done: plan.ready.length === 0 && summary.generated > 0, hint: plan.ready.length ? `${plan.ready.length} still to create` : `${summary.generated} created` },
            { n: 3, title: 'Pay salaries', done: summary.generated > 0 && summary.paidCount === summary.generated, hint: `${summary.paidCount} of ${summary.generated} paid` },
          ].map((s) => (
            <li
              key={s.n}
              className={`flex items-center gap-3 rounded-[var(--radius)] border px-3 py-2 ${s.done ? 'border-[var(--success)] bg-surface' : 'border-line bg-surface'}`}
            >
              <span
                className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${s.done ? 'bg-[var(--success)] text-white' : 'bg-surface-2 text-ink'}`}
              >
                {s.done ? '✓' : s.n}
              </span>
              <span>
                <span className="block font-medium text-ink">{s.title}</span>
                <span className="block text-xs text-ink-muted">{s.hint}</span>
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      <StaffTabs active="payroll" ctxCan={{ payroll: true, appraise: ctx.can('staff.appraise'), leave: ctx.can('leave.view') }} />

      <PeriodPicker year={year} month={month} />

      <Notice tone="info" title="Automatic salary deduction rule">
        One absence deducts one daily wage, a half-day deducts half, and every 3 late arrivals
        deduct one daily wage. Approved leave is paid. Admins and principals can add a reasoned
        manual deduction while a payslip is still a draft.
      </Notice>

      <MetricRow>
        <Metric
          label="Month total"
          value={money(summary.totalMinor)}
          sub={`${summary.generated} payslips`}
        />
        <Metric
          label="Paid out"
          value={money(summary.paidMinor)}
          sub={`${summary.paidCount} settled`}
          emphasis={summary.paidCount > 0 ? 'success' : undefined}
        />
        <Metric
          label="Awaiting payment"
          value={money(summary.draftMinor + summary.publishedMinor)}
          sub="Draft and published"
          emphasis={summary.draftMinor + summary.publishedMinor > 0 ? 'warning' : undefined}
        />
        <Metric
          label="Without a salary"
          value={String(summary.withoutSalary)}
          sub={`of ${summary.headcount} on the establishment`}
          emphasis={summary.withoutSalary > 0 ? 'warning' : undefined}
        />
      </MetricRow>

      {plan.missingSalary.length > 0 ? (
        <Notice tone="warning" title={`${plan.missingSalary.length} staff have no salary on record`}>
          They are skipped when payslips are created. Use &ldquo;Set missing salaries&rdquo; above to enter them all at once.
        </Notice>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>
            {monthName(month)} {year}
          </CardTitle>
          <span className="text-xs text-ink-subtle">
            Tick payslips to publish or pay them together
          </span>
        </CardHeader>

        {payslips.length === 0 ? (
          <EmptyState
            title="Nothing generated for this month"
            description={
              plan.ready.length > 0
                ? `Click "Create ${plan.ready.length} payslips" above. Figures come from each salary and the staff register.`
                : 'Set salaries first, then create the month’s payslips in one click.'
            }
          />
        ) : (
          <PayrollTable
            rows={payslips.map((payslip) => ({
              ...payslip,
              paidAt: payslip.paidAt?.toISOString() ?? null,
            }))}
            canManage={canManage}
            currency={currency}
            year={year}
            month={month}
            monthLabel={monthName(month)}
          />
        )}
      </Card>

      <p className="text-xs text-ink-subtle">
        {formatNumber(summary.onSalary)} of {formatNumber(summary.headcount)} staff have a salary
        structure on file.
      </p>
    </div>
  )
}
