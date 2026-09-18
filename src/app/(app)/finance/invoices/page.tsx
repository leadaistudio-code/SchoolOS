import Link from 'next/link'
import { requireContext } from '@/server/context'
import { invoiceFilterSchema, listInvoices } from '@/server/modules/finance/service'
import { customInvoiceGenerationOptions } from '@/server/modules/finance/simplicity'
import { getClassTree } from '@/server/modules/academics/service'
import { parseListQuery } from '@/lib/query'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { SearchBar } from '@/components/search-bar'
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

  const [{ rows, total, totals }, classes, generationOptions] = await Promise.all([
    listInvoices(ctx, query, filter),
    getClassTree(ctx),
    ctx.can('fees.invoice') ? customInvoiceGenerationOptions(ctx) : Promise.resolve([]),
  ])

  const currency = ctx.tenant.currency

  return (
    <div>
      <PageHeader
        title="Invoices"
        description={`${total} invoices · ${formatMoney(totals.outstanding, currency)} outstanding of ${formatMoney(totals.billed, currency)} billed`}
        actions={
          ctx.can('fees.invoice') ? (
            <Link href="#generate" className="text-sm font-medium text-[var(--brand-600)] hover:underline">
              Generate invoices
            </Link>
          ) : null
        }
      />

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
