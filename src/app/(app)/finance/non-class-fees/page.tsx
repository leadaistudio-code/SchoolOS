import Link from 'next/link'
import { requireContext } from '@/server/context'
import { listStructures } from '@/server/modules/finance/service'
import { customInvoiceGenerationOptions } from '@/server/modules/finance/simplicity'
import { PageHeader } from '@/components/page-header'
import { BackButton } from '@/components/back-button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button-variants'
import { formatMoney } from '@/lib/utils'
import { CustomInvoiceGenerator } from '../invoices/custom-generator'

export const metadata = { title: 'Non class linked fees' }

export default async function NonClassFeesPage() {
  const ctx = await requireContext('fees.structure')
  const canPublish = ctx.can('fees.structure_publish')
  const canInvoice = ctx.can('fees.invoice')
  const currency = ctx.tenant.currency

  const [structures, generationOptions] = await Promise.all([
    listStructures(ctx),
    canInvoice ? customInvoiceGenerationOptions(ctx) : Promise.resolve([]),
  ])

  const nonClass = structures.filter((structure) => !structure.classLevelId)
  const nonClassGenerators = generationOptions.filter((structure) => !structure.classLevelId)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Non class linked fees"
        description="Trip, books and other charges billed to selected students — not tied to a class fee plan"
        breadcrumbs={[
          { label: 'Fees & Collections', href: '/finance' },
          { label: 'Non class linked fees' },
        ]}
        actions={
          <>
            <BackButton fallbackHref="/finance" />
            <Link
              href="/finance/structures/new?scope=non-class"
              className={buttonVariants({ size: 'sm' })}
            >
              Create non class fee
            </Link>
            <Link
              href="/finance/structures"
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
            >
              Class fee setup
            </Link>
          </>
        }
      />

      {nonClass.length === 0 ? (
        <Card>
          <EmptyState
            title="No non class linked fees yet"
            description="Create a fee that is not tied to a class, then assign it to the students who should pay."
            action={
              <Link
                href="/finance/structures/new?scope=non-class"
                className={buttonVariants({ size: 'sm' })}
              >
                Create non class fee
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {nonClass.map((structure) => (
            <Card key={structure.id} className="overflow-hidden">
              <CardHeader>
                <div>
                  <CardTitle>{structure.name}</CardTitle>
                  <p className="text-xs text-ink-muted mt-0.5">
                    Not linked to a class · {structure.invoiceCount} invoices generated
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={structure.status === 'PUBLISHED' ? 'success' : 'neutral'}>
                    {structure.status.toLowerCase()}
                  </Badge>
                  {structure.status === 'DRAFT' && canPublish ? (
                    <Link
                      href={`/finance/structures/${structure.id}/publish`}
                      className={buttonVariants({ size: 'sm' })}
                    >
                      Publish & assign
                    </Link>
                  ) : null}
                  <Link
                    href={`/finance/structures/${structure.id}/dates`}
                    className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                  >
                    Billing dates
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-[var(--border)] rounded-[var(--radius-sm)] border border-line">
                  {structure.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm"
                    >
                      <span className="text-ink">{item.label}</span>
                      <span className="tnum font-medium">
                        {formatMoney(item.amountMinor, currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {canInvoice && nonClassGenerators.length > 0 ? (
        <div id="generate">
          <CustomInvoiceGenerator structures={nonClassGenerators} currency={currency} />
        </div>
      ) : null}
    </div>
  )
}
