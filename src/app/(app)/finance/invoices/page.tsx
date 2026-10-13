import Link from 'next/link'
import { requireContext } from '@/server/context'
import { invoiceFilterSchema, listInvoices } from '@/server/modules/finance/service'
import { customInvoiceGenerationOptions } from '@/server/modules/finance/simplicity'
import { getClassTree } from '@/server/modules/academics/service'
import { parseListQuery } from '@/lib/query'
import { PageHeader } from '@/components/page-header'
import { BackButton } from '@/components/back-button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { SearchBar } from '@/components/search-bar'
import { Metric, MetricRow } from '@/components/ui/metric'
import { formatMoney } from '@/lib/utils'
import { InvoiceFilters } from './filters'
import { CustomInvoiceGenerator } from './custom-generator'
import { InvoiceTable } from './invoice-table'

export const metadata = { title: 'Invoices' }

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('fees.view')
  const params = await searchParams
  const query = parseListQuery(params)
  const filter = invoiceFilterSchema.parse(params)

  const [{ rows, total, totals }, classes, generationOptions, openStudents] = await Promise.all([
    listInvoices(ctx, query, filter),
    getClassTree(ctx),
    ctx.can('fees.invoice') ? customInvoiceGenerationOptions(ctx) : Promise.resolve([]),
    ctx.db.feeInvoice.groupBy({
      by: ['studentId'],
      where: {
        status: { notIn: ['CANCELLED', 'DRAFT'] },
        balanceMinor: { gt: 0 },
      },
    }),
  ])

  const currency = ctx.tenant.currency

  return (
    <div className="space-y-4">
      <PageHeader
        title="Invoices"
        description="Invoice-wise billing and outstanding balances"
        actions={
          <>
            <BackButton fallbackHref="/finance" />
            <Link
              href="/finance/students?view=outstanding"
              className="text-sm font-medium text-[var(--brand-600)] hover:underline"
            >
              Student outstanding view
            </Link>
            {ctx.can('fees.invoice') ? (
              <Link
                href="#generate"
                className="text-sm font-medium text-[var(--brand-600)] hover:underline"
              >
                Generate invoices
              </Link>
            ) : null}
          </>
        }
      />

      <MetricRow columns={4}>
        <Metric
          label="Invoices"
          value={String(total)}
          sub={`${openStudents.length} students with open balance`}
        />
        <Metric label="Billed" value={formatMoney(totals.billed, currency)} />
        <Metric
          label="Collected"
          value={formatMoney(totals.collected, currency)}
          emphasis="success"
        />
        <Metric
          label="Total outstanding"
          value={formatMoney(totals.outstanding, currency)}
          emphasis={totals.outstanding > 0 ? 'danger' : 'success'}
          sub="Sum of open invoice balances"
          href="/finance/students?view=outstanding"
        />
      </MetricRow>

      {ctx.can('fees.invoice') ? (
        <CustomInvoiceGenerator structures={generationOptions} currency={currency} />
      ) : null}

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
          <InvoiceTable
            rows={rows.map((invoice) => ({
              ...invoice,
              dueOn: invoice.dueOn.toISOString(),
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
