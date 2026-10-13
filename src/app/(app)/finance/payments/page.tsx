import { requireContext } from '@/server/context'
import { listPayments, paymentFilterSchema, paymentSummary } from '@/server/modules/finance/payments'
import { parseListQuery } from '@/lib/query'
import { PageHeader } from '@/components/page-header'
import { BackButton } from '@/components/back-button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { SearchBar } from '@/components/search-bar'
import { formatMoney } from '@/lib/utils'
import { PaymentFilters } from './filters'
import { PaymentTable } from './payment-table'
import { ReceiptSummaryCards } from './summary-cards'

export const metadata = { title: 'Fee receipts' }

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('fees.view')
  const params = await searchParams
  const query = parseListQuery(params)
  const filter = paymentFilterSchema.parse(params)

  const [{ rows, total }, summary] = await Promise.all([
    listPayments(ctx, query, filter),
    paymentSummary(ctx, query.q, filter),
  ])
  const currency = ctx.tenant.currency
  const exportQuery = new URLSearchParams(
    Object.entries(params).filter((e): e is [string, string] => !!e[1] && e[0] !== 'page'),
  ).toString()

  return (
    <div className="space-y-4">
      <PageHeader
        title="Fee receipts"
        description={`${total} receipts · ${formatMoney(summary.totalMinor, currency)} received in this view`}
        actions={
          <div className="flex items-center gap-3">
            {ctx.can('fees.export') ? (
              <a
                href={`/api/v1/finance/payments/export${exportQuery ? `?${exportQuery}` : ''}`}
                className="text-sm font-medium text-[var(--brand-600)] hover:underline"
              >
                Export CSV
              </a>
            ) : null}
            <BackButton fallbackHref="/finance" />
          </div>
        }
      />

      <ReceiptSummaryCards summary={summary} currency={currency} />

      <Card className="overflow-hidden">
        <SearchBar placeholder="Search receipt, bill book, cheque no., UTR, student or admission number">
          <PaymentFilters />
        </SearchBar>

        {rows.length === 0 ? (
          <EmptyState
            title={params.q ? 'No receipts match' : 'No receipts in this view'}
            description="Collected fees appear here with their receipt numbers."
          />
        ) : (
          <PaymentTable
            rows={rows.map((payment) => ({
              ...payment,
              paidAt: payment.paidAt?.toISOString() ?? null,
              createdAt: payment.createdAt.toISOString(),
            }))}
            currency={currency}
            total={total}
            page={query.page}
            pageSize={query.pageSize}
            canExport={ctx.can('fees.export')}
            canCollect={ctx.can('fees.collect')}
          />
        )}
      </Card>
    </div>
  )
}
