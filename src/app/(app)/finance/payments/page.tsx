import Link from 'next/link'
import { requireContext } from '@/server/context'
import { listPayments, paymentFilterSchema } from '@/server/modules/finance/payments'
import { parseListQuery } from '@/lib/query'
import { formatDay } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { SearchBar } from '@/components/search-bar'
import { Pagination } from '@/components/pagination'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatMoney } from '@/lib/utils'
import { PaymentFilters } from './filters'

export const metadata = { title: 'Payments' }

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('fees.view')
  const params = await searchParams
  const query = parseListQuery(params)
  const filter = paymentFilterSchema.parse(params)

  const { rows, total, collectedMinor } = await listPayments(ctx, query, filter)
  const currency = ctx.tenant.currency

  return (
    <div>
      <PageHeader
        title="Payments"
        description={`${total} payments · ${formatMoney(collectedMinor, currency)} successfully collected in this view`}
      />

      <Card className="overflow-hidden">
        <SearchBar placeholder="Search receipt, reference, student or admission number">
          <PaymentFilters />
        </SearchBar>

        {rows.length === 0 ? (
          <EmptyState
            title={params.q ? 'No payments match' : 'No payments yet'}
            description="Collected fees appear here with their receipt numbers."
          />
        ) : (
          <>
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Receipt</TH>
                    <TH>Student</TH>
                    <TH>Mode</TH>
                    <TH>Date</TH>
                    <TH align="right">Amount</TH>
                    <TH>Status</TH>
                    <TH align="right">
                      <span className="sr-only">Actions</span>
                    </TH>
                  </tr>
                </THead>
                <TBody>
                  {rows.map((p) => (
                    <TR key={p.id}>
                      <TD className="text-sm tnum text-ink">
                        {p.receiptNumber ?? <span className="text-ink-subtle">—</span>}
                        {p.reference ? (
                          <span className="block text-xs text-ink-subtle">
                            {p.reference}
                          </span>
                        ) : null}
                      </TD>
                      <TD>
                        <Link
                          href={`/students/${p.studentId}`}
                          className="text-sm text-ink hover:text-[var(--brand-600)]"
                        >
                          {p.studentName}
                        </Link>
                        <span className="block text-xs text-ink-subtle tnum">
                          {p.admissionNo}
                        </span>
                      </TD>
                      <TD className="text-sm text-ink-muted first-letter:uppercase">
                        {p.mode.toLowerCase().replace('_', ' ')}
                        {p.provider && p.provider !== 'manual' ? (
                          <span className="block text-xs text-ink-subtle">{p.provider}</span>
                        ) : null}
                      </TD>
                      <TD className="text-sm text-ink-muted">
                        {p.paidAt
                          ? formatDay(p.paidAt, 'd MMM yyyy')
                          : formatDay(p.createdAt, 'd MMM yyyy')}
                      </TD>
                      <TD align="right" className="text-sm font-medium">
                        {formatMoney(p.amountMinor, currency)}
                        {p.refundedMinor > 0 ? (
                          <span className="block text-xs text-[var(--danger)]">
                            −{formatMoney(p.refundedMinor, currency)} refunded
                          </span>
                        ) : null}
                      </TD>
                      <TD>
                        <StatusBadge
                          status={p.status}
                          tone={p.status === 'INITIATED' ? 'info' : undefined}
                        />
                      </TD>
                      <TD align="right">
                        <Link
                          href={`/finance/payments/${p.id}`}
                          className="text-sm text-[var(--brand-600)] hover:underline"
                        >
                          Receipt
                        </Link>
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
              label="payments"
            />
          </>
        )}
      </Card>
    </div>
  )
}
