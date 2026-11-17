import Link from 'next/link'
import { requireContext } from '@/server/context'
import { listBadDebts } from '@/server/modules/finance/bad-debts'
import { PageHeader } from '@/components/page-header'
import { BackButton } from '@/components/back-button'
import { Metric } from '@/components/ui/metric'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/states'
import { formatDay } from '@/lib/dates'
import { formatMoney } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button-variants'

export const metadata = { title: 'Bad debts' }

export default async function BadDebtsPage() {
  const ctx = await requireContext('fees.accounts')
  const { rows, totalMinor, studentCount } = await listBadDebts(ctx)
  const currency = ctx.tenant.currency

  return (
    <div className="space-y-4">
      <PageHeader
        title="Bad debts"
        description="Unpaid fees for students who have dropped out — no longer counted in outstanding"
        actions={<BackButton fallbackHref="/finance" />}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Metric label="Bad debt total" value={formatMoney(totalMinor, currency)} emphasis="danger" />
        <Metric label="Dropped-out students with unpaid fees" value={String(studentCount)} />
      </div>
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Dropped-out balances</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <EmptyState
              title="No bad debts"
              description="When a student is marked as dropped out with unpaid fees, the balance appears here instead of Outstanding."
            />
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Student</TH>
                    <TH>Last class</TH>
                    <TH>Dropped</TH>
                    <TH>Open invoices</TH>
                    <TH align="right">Unpaid</TH>
                    <TH><span className="sr-only">Open</span></TH>
                  </tr>
                </THead>
                <TBody>
                  {rows.map((row) => (
                    <TR key={row.studentId}>
                      <TD>
                        <Link className="text-sm font-medium text-ink hover:text-[var(--brand-600)]" href={`/finance/students/${row.studentId}`}>
                          {row.studentName}
                        </Link>
                        <p className="text-xs text-ink-subtle">{row.admissionNo}</p>
                      </TD>
                      <TD className="text-sm">{row.className ?? '—'}</TD>
                      <TD className="text-sm">{row.droppedAt ? formatDay(row.droppedAt, 'd MMM yyyy') : '—'}</TD>
                      <TD className="text-sm tnum">{row.invoiceCount}</TD>
                      <TD align="right" className="font-medium tnum">{formatMoney(row.balanceMinor, currency)}</TD>
                      <TD>
                        <Link className={buttonVariants({ variant: 'secondary', size: 'sm' })} href={`/students/${row.studentId}`}>
                          Student
                        </Link>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
