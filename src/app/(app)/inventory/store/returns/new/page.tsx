import Link from 'next/link'
import { requireContext } from '@/server/context'
import { storeCatalogue } from '@/server/modules/store/service'
import { getSaleReturnableLines } from '@/server/modules/store/returns'
import { PageHeader } from '@/components/page-header'
import { BackButton } from '@/components/back-button'
import { buttonVariants } from '@/components/ui/button-variants'
import { StoreTabs } from '../../store-tabs'
import { ReturnWizard } from '../return-wizard'

export const metadata = { title: 'New store return' }

export default async function NewStoreReturnPage({ searchParams }: { searchParams: Promise<{ sale?: string }> }) {
  const ctx = await requireContext('store.view')
  const { sale: saleId } = await searchParams
  const canProcess = ctx.canAny('store.return', 'store.void')

  if (!saleId) {
    return (
      <div className="space-y-4">
        <PageHeader title="Return or exchange" description="Pick a completed bill first, then choose quantities to bring back to stock." actions={<BackButton fallbackHref="/inventory/store/returns" />} />
        <StoreTabs ctx={ctx} active="returns" />
        <p className="rounded-lg border border-line bg-surface p-6 text-sm text-ink-muted">
          Open a bill from{' '}
          <Link href="/inventory/store/sales" className="font-medium text-[var(--brand-600)] hover:underline">
            Sales & bills
          </Link>{' '}
          and use <strong className="font-medium text-ink">Return / Exchange</strong>, or append <code className="text-xs">?sale=…</code> to this URL with the bill id.
        </p>
      </div>
    )
  }

  const [{ sale, lines }, items] = await Promise.all([
    getSaleReturnableLines(ctx, saleId),
    canProcess ? storeCatalogue(ctx) : Promise.resolve([]),
  ])
  const buyer =
    sale.student ? `${sale.student.firstName} ${sale.student.lastName} (${sale.student.admissionNo})` : sale.customerName ?? 'Walk-in'

  return (
    <div className="space-y-4">
      <PageHeader
        title="Return or exchange"
        description={`Against bill ${sale.number}`}
        actions={
          <>
            <Link href={`/inventory/store/sales/${sale.id}`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              View bill
            </Link>
            <BackButton fallbackHref="/inventory/store/returns" />
          </>
        }
      />
      <StoreTabs ctx={ctx} active="returns" />
      {!canProcess ? (
        <p className="rounded-lg border border-line bg-surface-2 p-4 text-sm text-ink-muted">You can view returnable lines but need return/void permission to save.</p>
      ) : null}
      {canProcess ? (
        <ReturnWizard
          saleId={sale.id}
          saleNumber={sale.number}
          buyerLabel={buyer}
          lines={lines}
          currency={ctx.tenant.currency}
          items={items.map(({ avgCostMinor: _a, reorderLevel: _r, barcode: _b, ...i }) => i)}
        />
      ) : (
        <ul className="rounded-xl border border-line bg-surface p-4 text-sm">
          {lines.map((l) => (
            <li key={l.id} className="py-1 text-ink-muted">
              {l.description}: {l.returnableQty} of {l.quantity} left to return
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}