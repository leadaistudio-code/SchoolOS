import { requireContext } from '@/server/context'
import { listPayslips, monthName, payrollSummary } from '@/server/modules/staff/payroll'
import { formatMoney, formatNumber } from '@/lib/utils'
import { PageHeader } from '@/components/page-header'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, Notice } from '@/components/ui/states'
import { Metric, MetricRow } from '@/components/ui/metric'
import { StaffTabs } from '../tabs'
import { PeriodPicker } from './period-picker'
import { PayrollTable } from './payroll-table'

export const metadata = { title: 'Payroll' }

/**
 * The payroll month.
 *
 * One month at a time, because that is how payroll is actually run and
 * checked. Payslips are raised per person from their own profile — this page
 * is where the month is reviewed, published and marked paid, and where the
 * people nobody has set a salary for become visible.
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

  const [summary, payslips] = await Promise.all([
    payrollSummary(ctx, year, month),
    listPayslips(ctx, { periodYear: year, periodMonth: month }),
  ])

  const canManage = ctx.can('staff.payroll_manage')
  const currency = ctx.tenant.currency
  const money = (minor: number) => formatMoney(minor, currency)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Payroll"
        description={`${monthName(month)} ${year} · ${summary.generated} of ${summary.headcount} payslips generated`}
        breadcrumbs={[{ label: 'Teachers & staff', href: '/staff' }, { label: 'Payroll' }]}
      />

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

      {summary.withoutSalary > 0 ? (
        <Notice tone="warning" title={`${summary.withoutSalary} staff have no salary on record`}>
          They cannot be paid through the portal until one is set. Open a profile and use the
          Salary tab.
        </Notice>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>
            {monthName(month)} {year}
          </CardTitle>
          <span className="text-xs text-ink-subtle">
            Generate a payslip from each person&apos;s Salary tab
          </span>
        </CardHeader>

        {payslips.length === 0 ? (
          <EmptyState
            title="Nothing generated for this month"
            description="Open a staff profile, go to Salary, and generate the month. Figures come from the salary in force and the staff register."
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
