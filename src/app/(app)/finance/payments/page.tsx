import { requireContext } from '@/server/context'
import { listPayments, paymentFilterSchema } from '@/server/modules/finance/payments'
import { parseListQuery } from '@/lib/query'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { SearchBar } from '@/components/search-bar'
import { formatMoney } from '@/lib/utils'
import { PaymentFilters } from './filters'
import { PaymentTable } from './payment-table'

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
        <SearchBar placeholder="Search receipt, bill book, reference, student or admission number">
          <PaymentFilters />
        </SearchBar>

        {rows.length === 0 ? (
          <EmptyState
            title={params.q ? 'No payments match' : 'No payments yet'}
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
          />
        )}
      </Card>
    </div>
  )
}
