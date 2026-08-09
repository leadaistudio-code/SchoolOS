import Link from 'next/link'
import { requireContext } from '@/server/context'
import { invoiceFilterSchema, listInvoices, listStructures } from '@/server/modules/finance/service'
import { getClassTree } from '@/server/modules/academics/service'
import { parseListQuery } from '@/lib/query'
import { formatDay } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { SearchBar } from '@/components/search-bar'
import { Pagination } from '@/components/pagination'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatMoney, cn } from '@/lib/utils'
import { InvoiceFilters } from './filters'
import { GenerateInvoices } from './generate'

export const metadata = { title: 'Invoices' }

const TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  PAID: 'success',
  ISSUED: 'warning',
  PARTIALLY_PAID: 'warning',
  OVERDUE: 'danger',
  CANCELLED: 'neutral',
  DRAFT: 'neutral',
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('fees.view')
  const params = await searchParams
  const query = parseListQuery(params)
  const filter = invoiceFilterSchema.parse(params)

  const [{ rows, total, totals }, classes, structures] = await Promise.all([
    listInvoices(ctx, query, filter),
    getClassTree(ctx),
    ctx.can('fees.invoice') ? listStructures(ctx) : Promise.resolve([]),
  ])

  const currency = ctx.tenant.currency

  return (
    <div>
      <PageHeader
        title="Invoices"
        description={`${total} invoices · ${formatMoney(totals.outstanding, currency)} outstanding of ${formatMoney(totals.billed, currency)} billed`}
        actions={
          ctx.can('fees.invoice') ? (
            <GenerateInvoices
              structures={structures.map((s) => ({
                id: s.id,
                name: s.name,
                className: s.className,
                totalMinor: s.totalMinor,
              }))}
              classes={classes.map((c) => ({
                id: c.id,
                name: c.name,
                sections: c.sections.map((s) => ({ id: s.id, name: s.name })),
              }))}
              currency={currency}
            />
          ) : null
        }
      />

      <Card className="overflow-hidden">
        <SearchBar placeholder="Search invoice number, title, student or admission number">
          <InvoiceFilters classes={classes} />
        </SearchBar>

        {rows.length === 0 ? (
          <EmptyState
            title={Object.keys(params).length ? 'No invoices match' : 'No invoices yet'}
            description={
              ctx.can('fees.invoice')
                ? 'Generate invoices from a fee structure to start billing.'
                : 'Invoices issued by the school will appear here.'
            }
          />
        ) : (
          <>
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Invoice</TH>
                    <TH>Student</TH>
                    <TH>Due</TH>
                    <TH align="right">Total</TH>
                    <TH align="right">Balance</TH>
                    <TH>Status</TH>
                  </tr>
                </THead>
                <TBody>
                  {rows.map((i) => (
                    <TR key={i.id}>
                      <TD>
                        <Link
                          href={`/finance/invoices/${i.id}`}
                          className="text-[13.5px] text-ink hover:text-[var(--brand-600)]"
                        >
                          {i.title}
                        </Link>
                        <span className="block text-[12px] text-ink-subtle tnum">{i.number}</span>
                      </TD>
                      <TD>
                        <span className="block text-[13px] text-ink">{i.studentName}</span>
                        <span className="block text-[12px] text-ink-subtle">
                          {i.admissionNo}
                          {i.className ? ` · ${i.className}` : ''}
                        </span>
                      </TD>
                      <TD className="text-[13px] text-ink-muted">
                        {formatDay(i.dueOn, 'd MMM yyyy')}
                        {i.daysOverdue > 0 ? (
                          <span className="block text-[11.5px] text-[var(--danger)]">
                            {i.daysOverdue} days overdue
                          </span>
                        ) : null}
                      </TD>
                      <TD align="right" className="text-[13px] text-ink-muted">
                        {formatMoney(i.totalMinor, currency)}
                      </TD>
                      <TD align="right">
                        <span
                          className={cn(
                            'text-[13px] font-medium',
                            i.balanceMinor > 0 ? 'text-ink' : 'text-ink-subtle',
                          )}
                        >
                          {i.balanceMinor > 0 ? formatMoney(i.balanceMinor, currency) : '—'}
                        </span>
                      </TD>
                      <TD>
                        <Badge tone={TONE[i.status] ?? 'neutral'}>
                          {i.status.toLowerCase().replace('_', ' ')}
                        </Badge>
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
              label="invoices"
            />
          </>
        )}
      </Card>
    </div>
  )
}
