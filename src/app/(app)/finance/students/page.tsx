import Link from 'next/link'
import { requireContext } from '@/server/context'
import { listStudentFeeAccounts } from '@/server/modules/finance/simplicity'
import { getClassTree } from '@/server/modules/academics/service'
import { PageHeader } from '@/components/page-header'
import { BackButton } from '@/components/back-button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { Pagination } from '@/components/pagination'
import { Metric, MetricRow } from '@/components/ui/metric'
import { formatMoney, cn } from '@/lib/utils'
import { LedgerFilters } from './ledger-filters'
import { AlertCircle, CalendarClock, FileText, Users } from 'lucide-react'
import { LinkTabs } from '@/components/ui/tabs'

export const metadata = { title: 'Fee ledger' }

export default async function FeeStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    page?: string
    classLevelId?: string
    sectionId?: string
    balance?: string
    view?: string
  }>
}) {
  const ctx = await requireContext('fees.accounts')
  const params = await searchParams
  const page = Math.max(1, Number(params.page) || 1)
  const view = params.view === 'outstanding' ? 'outstanding' : 'students'
  const balance =
    view === 'outstanding'
      ? 'due'
      : params.balance === 'due' || params.balance === 'clear' || params.balance === 'credit'
        ? params.balance
        : 'all'

  const [result, classes] = await Promise.all([
    listStudentFeeAccounts(ctx, {
      q: params.q,
      page,
      pageSize: 25,
      classLevelId: params.classLevelId,
      sectionId: params.sectionId,
      balance,
    }),
    getClassTree(ctx),
  ])
  const currency = ctx.tenant.currency
  const canExport = ctx.can('fees.export')
  const { summary } = result

  const tabQuery = (nextView: 'students' | 'outstanding') => {
    const next = new URLSearchParams()
    if (params.q) next.set('q', params.q)
    if (params.classLevelId) next.set('classLevelId', params.classLevelId)
    if (params.sectionId) next.set('sectionId', params.sectionId)
    if (nextView === 'outstanding') next.set('view', 'outstanding')
    else if (params.balance) next.set('balance', params.balance)
    const qs = next.toString()
    return qs ? `/finance/students?${qs}` : '/finance/students'
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Ledger"
        description="Student fee accounts and total outstanding"
        actions={<BackButton fallbackHref="/finance" />}
      />

      <MetricRow columns={4}>
        <Metric
          label="Students"
          value={String(summary.students)}
          sub={
            summary.studentsWithDue > 0
              ? `${summary.studentsWithDue} with balance due`
              : 'No dues in this filter'
          }
        />
        <Metric
          label="Amount requested"
          value={formatMoney(summary.requestedMinor, currency)}
          sub={`Discount ${formatMoney(summary.discountMinor, currency)}`}
        />
        <Metric
          label="Collected"
          value={formatMoney(summary.paidMinor, currency)}
          emphasis="success"
        />
        <Metric
          label="Total outstanding"
          value={formatMoney(summary.outstandingMinor, currency)}
          emphasis={summary.outstandingMinor > 0 ? 'danger' : 'success'}
          sub={
            summary.lastSessionDueMinor > 0
              ? `Includes last session due ${formatMoney(summary.lastSessionDueMinor, currency)}`
              : 'Against invoices already generated'
          }
        />
      </MetricRow>

      <LinkTabs
        label="Student fee views"
        items={[
          { label: 'All students', href: tabQuery('students'), active: view === 'students', icon: Users },
          { label: 'Outstanding only', href: tabQuery('outstanding'), active: view === 'outstanding', icon: AlertCircle, accent: '#f43f5e' },
          { label: 'Invoices view', href: '/finance/invoices', active: false, icon: FileText, accent: '#0ea5e9' },
          { label: 'Dues view', href: '/finance/dues', active: false, icon: CalendarClock, accent: '#f59e0b' },
        ]}
      />

      <Card>
        <CardContent>
          <LedgerFilters
            canExport={canExport}
            resultCount={result.total}
            classes={classes.map((c) => ({
              id: c.id,
              name: c.name,
              sections: c.sections.map((s) => ({ id: s.id, name: s.name })),
            }))}
          />
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {view === 'outstanding' ? (
            <div className="border-b border-line bg-surface-2 px-4 py-3 text-sm text-ink">
              Showing students with balance due ·{' '}
              <span className="font-semibold tnum text-[var(--danger)]">
                {formatMoney(summary.outstandingMinor, currency)}
              </span>{' '}
              total outstanding across {summary.studentsWithDue} student
              {summary.studentsWithDue === 1 ? '' : 's'}
            </div>
          ) : null}
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Student name</TH>
                  <TH>Admission no.</TH>
                  <TH>Class</TH>
                  <TH>Section</TH>
                  <TH align="right">Last Session Due</TH>
                  <TH align="right">Amount Requested</TH>
                  <TH align="right">Discount</TH>
                  <TH align="right">Amount Paid</TH>
                  <TH align="right">Balance</TH>
                </tr>
              </THead>
              <TBody>
                {result.rows.length === 0 ? (
                  <TR>
                    <TD colSpan={9} className="py-10 text-center text-sm text-ink-muted">
                      {view === 'outstanding'
                        ? 'No students have outstanding fees for these filters.'
                        : 'No students match these filters.'}
                    </TD>
                  </TR>
                ) : (
                  result.rows.map((student) => (
                    <TR key={student.id}>
                      <TD>
                        <Link
                          className="text-sm font-medium text-ink hover:text-[var(--brand-600)] hover:underline"
                          href={`/finance/students/${student.id}`}
                        >
                          {student.name}
                        </Link>
                      </TD>
                      <TD className="whitespace-nowrap text-xs tnum text-ink-muted">
                        {student.admissionNo}
                      </TD>
                      <TD className="whitespace-nowrap text-sm">{student.className}</TD>
                      <TD className="whitespace-nowrap text-sm">{student.sectionName}</TD>
                      <TD align="right" className="whitespace-nowrap tnum">
                        {formatMoney(student.lastSessionDueMinor, currency)}
                      </TD>
                      <TD align="right" className="whitespace-nowrap tnum">
                        {formatMoney(student.amountRequestedMinor, currency)}
                      </TD>
                      <TD align="right" className="tnum">
                        {formatMoney(student.discountMinor, currency)}
                      </TD>
                      <TD align="right" className="whitespace-nowrap tnum">
                        {formatMoney(student.paidMinor, currency)}
                      </TD>
                      <TD align="right" className="whitespace-nowrap font-semibold tnum">
                        <span
                          className={
                            student.balanceMinor > 0 ? 'text-[var(--danger)]' : 'text-success'
                          }
                        >
                          {formatMoney(student.balanceMinor, currency)}
                        </span>
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </TableWrap>
          <Pagination total={result.total} page={page} pageSize={25} label="accounts" />
        </CardContent>
      </Card>
    </div>
  )
}
