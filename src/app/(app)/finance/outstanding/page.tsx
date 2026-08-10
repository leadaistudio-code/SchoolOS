import Link from 'next/link'
import { requireContext } from '@/server/context'
import { listInvoices, outstandingByClass } from '@/server/modules/finance/service'
import { parseListQuery } from '@/lib/query'
import { formatDay } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { Pagination } from '@/components/pagination'
import { buttonVariants } from '@/components/ui/button-variants'
import { formatMoney } from '@/lib/utils'

export const metadata = { title: 'Outstanding fees' }

export default async function OutstandingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('fees.view')
  const params = await searchParams

  // Oldest overdue first: that is the order collection is chased in.
  const query = parseListQuery({
    ...params,
    sort: params.sort ?? 'dueOn',
    dir: params.dir ?? 'asc',
  })

  const [{ rows, total }, byClass] = await Promise.all([
    listInvoices(ctx, query, { overdueOnly: 'yes' }),
    outstandingByClass(ctx),
  ])

  const currency = ctx.tenant.currency
  const totalOverdue = byClass.reduce((sum, r) => sum + Number(r.overdue), 0)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Outstanding fees"
        description={`${formatMoney(totalOverdue, currency)} overdue across ${total} invoices`}
      />

      <div className="grid gap-4 lg:grid-cols-[300px_1fr] items-start">
        <Card>
          <CardHeader>
            <CardTitle>By class</CardTitle>
          </CardHeader>
          <CardContent className="py-1">
            {byClass.length === 0 ? (
              <EmptyState title="All settled" description="Nothing outstanding." />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {byClass.map((r) => (
                  <li key={r.className} className="flex items-center justify-between gap-3 py-2">
                    <div>
                      <p className="text-sm text-ink">{r.className}</p>
                      <p className="text-xs text-ink-subtle">{Number(r.students)} students</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm tnum text-ink">
                        {formatMoney(Number(r.outstanding), currency)}
                      </p>
                      {Number(r.overdue) > 0 ? (
                        <p className="text-xs text-[var(--danger)] tnum">
                          {formatMoney(Number(r.overdue), currency)} overdue
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <div>
              <CardTitle>Overdue invoices</CardTitle>
              <p className="text-sm text-ink-muted mt-0.5">Oldest first</p>
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {rows.length === 0 ? (
              <EmptyState
                title="Nothing overdue"
                description="Every issued invoice is either paid or not yet due."
              />
            ) : (
              <>
                <TableWrap>
                  <Table>
                    <THead>
                      <tr>
                        <TH>Student</TH>
                        <TH>Invoice</TH>
                        <TH>Overdue by</TH>
                        <TH align="right">Balance</TH>
                        <TH align="right">
                          <span className="sr-only">Collect</span>
                        </TH>
                      </tr>
                    </THead>
                    <TBody>
                      {rows.map((i) => (
                        <TR key={i.id}>
                          <TD>
                            <Link
                              href={`/students/${i.studentId}`}
                              className="text-sm text-ink hover:text-[var(--brand-600)]"
                            >
                              {i.studentName}
                            </Link>
                            <span className="block text-xs text-ink-subtle">
                              {i.admissionNo}
                              {i.className ? ` · ${i.className}` : ''}
                            </span>
                          </TD>
                          <TD>
                            <span className="block text-sm text-ink">{i.title}</span>
                            <span className="block text-xs text-ink-subtle">
                              due {formatDay(i.dueOn, 'd MMM yyyy')}
                            </span>
                          </TD>
                          <TD>
                            <Badge tone={i.daysOverdue > 30 ? 'danger' : 'warning'}>
                              {i.daysOverdue} days
                            </Badge>
                          </TD>
                          <TD align="right" className="text-sm font-medium">
                            {formatMoney(i.balanceMinor, currency)}
                          </TD>
                          <TD align="right">
                            {ctx.can('fees.collect') ? (
                              <Link
                                href={`/finance/collect?student=${i.studentId}`}
                                className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                              >
                                Collect
                              </Link>
                            ) : null}
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableWrap>
                <Pagination
                  total={total}
                  page={query.page}
                  pageSize={query.pageSize}
                  label="overdue invoices"
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
