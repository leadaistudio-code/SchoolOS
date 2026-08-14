import Link from 'next/link'
import { requireContext } from '@/server/context'
import { listPayslips, monthName, payrollSummary } from '@/server/modules/staff/payroll'
import { formatMoney, formatNumber } from '@/lib/utils'
import { formatDay } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { EmptyState, Notice } from '@/components/ui/states'
import { Metric, MetricRow } from '@/components/ui/metric'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { StaffTabs } from '../tabs'
import { PayslipStatusControl } from '../[id]/panels'
import { PeriodPicker } from './period-picker'

export const metadata = { title: 'Payroll' }

const TONE: Record<string, BadgeTone> = {
  DRAFT: 'neutral',
  PUBLISHED: 'info',
  PAID: 'success',
}

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
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Staff member</TH>
                  <TH>Department</TH>
                  <TH align="right">Days paid</TH>
                  <TH align="right">Gross</TH>
                  <TH align="right">Deductions</TH>
                  <TH align="right">Net</TH>
                  <TH>Status</TH>
                  {canManage ? <TH align="right">&nbsp;</TH> : null}
                </tr>
              </THead>
              <TBody>
                {payslips.map((p) => (
                  <TR key={p.id}>
                    <TD>
                      <Link
                        href={`/staff/${p.staff.id}?tab=salary`}
                        className="block text-sm text-ink hover:underline"
                      >
                        {p.staff.firstName} {p.staff.lastName}
                      </Link>
                      <span className="block text-xs tnum text-ink-subtle">
                        {p.staff.employeeCode}
                      </span>
                    </TD>
                    <TD className="text-sm text-ink-muted">{p.staff.department ?? '—'}</TD>
                    <TD align="right" className="text-sm">
                      {p.paidDays}/{p.workingDays}
                    </TD>
                    <TD align="right" className="text-sm">
                      {money(p.grossMinor)}
                    </TD>
                    <TD align="right" className="text-sm">
                      {money(p.deductionsMinor + p.lopMinor)}
                    </TD>
                    <TD align="right" className="text-sm font-medium text-ink">
                      {money(p.netMinor)}
                    </TD>
                    <TD>
                      <Badge tone={TONE[p.status] ?? 'neutral'}>{p.status.toLowerCase()}</Badge>
                      {p.paidAt ? (
                        <span className="ml-1.5 text-xs tnum text-ink-subtle">
                          {formatDay(p.paidAt)}
                        </span>
                      ) : null}
                    </TD>
                    {canManage ? (
                      <TD align="right">
                        <PayslipStatusControl id={p.id} status={p.status} />
                      </TD>
                    ) : null}
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <p className="text-xs text-ink-subtle">
        {formatNumber(summary.onSalary)} of {formatNumber(summary.headcount)} staff have a salary
        structure on file.
      </p>
    </div>
  )
}
