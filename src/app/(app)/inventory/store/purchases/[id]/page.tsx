import { requireContext } from '@/server/context'
import { getStorePurchase } from '@/server/modules/store/service'
import { itemLabel, storePaymentLabel } from '@/lib/store/options'
import { formatDay } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { BackButton } from '@/components/back-button'
import { Card } from '@/components/ui/card'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatMoney } from '@/lib/utils'
import { PrintButton } from '@/app/(app)/finance/payments/[id]/print-button'

export const metadata = { title: 'Stock receipt' }

export default async function StorePurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext('store.view')
  const { id } = await params
  const p = await getStorePurchase(ctx, id)
  const currency = ctx.tenant.currency
  const school = ctx.tenant.school

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="no-print">
        <PageHeader
          title={p.number}
          description={`Goods received from ${p.vendorName} on ${formatDay(p.purchaseDate, 'd MMMM yyyy')}`}
          actions={
            <>
              <PrintButton />
              <BackButton fallbackHref="/inventory/store/purchases" />
            </>
          }
        />
      </div>
      <Card className="p-6 print:border-0 print:p-0 print:shadow-none">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
          <div>
            <p className="text-lg font-bold text-ink">{school?.name ?? ctx.tenant.name}</p>
            <p className="text-sm font-semibold uppercase tracking-wider text-ink-muted">Goods receipt note</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm">
            <dt className="text-ink-muted">Receipt no.</dt>
            <dd className="font-semibold tnum">{p.number}</dd>
            <dt className="text-ink-muted">Date</dt>
            <dd>{formatDay(p.purchaseDate)}</dd>
            <dt className="text-ink-muted">Vendor</dt>
            <dd>{p.vendorName}</dd>
            {p.invoiceNo ? (
              <>
                <dt className="text-ink-muted">Vendor bill</dt>
                <dd>{p.invoiceNo}</dd>
              </>
            ) : null}
            <dt className="text-ink-muted">Paid by</dt>
            <dd>{storePaymentLabel(p.paymentMode)}</dd>
          </dl>
        </div>
        <TableWrap>
          <Table>
            <THead>
              <tr>
                <TH>Item</TH>
                <TH align="right">Qty</TH>
                <TH align="right">Cost / unit</TH>
                <TH align="right">Amount</TH>
              </tr>
            </THead>
            <TBody>
              {p.lines.map((l) => (
                <TR key={l.id}>
                  <TD>
                    <p className="text-sm text-ink">{itemLabel(l.item)}</p>
                    <p className="text-xs text-ink-subtle">{l.item.sku}</p>
                  </TD>
                  <TD align="right">{l.quantity} {l.item.unit}</TD>
                  <TD align="right">{formatMoney(l.unitCostMinor, currency)}</TD>
                  <TD align="right" className="font-medium text-ink">{formatMoney(l.amountMinor, currency)}</TD>
                </TR>
              ))}
              <tr className="bg-surface-2">
                <TD colSpan={3} className="font-semibold text-ink">Total</TD>
                <TD align="right" className="font-semibold text-ink">{formatMoney(p.totalMinor, currency)}</TD>
              </tr>
            </TBody>
          </Table>
        </TableWrap>
        {p.notes ? <p className="mt-3 text-sm text-ink-muted">Notes: {p.notes}</p> : null}
        <div className="mt-10 grid grid-cols-2 gap-8 text-center text-xs text-ink-muted">
          <p className="border-t border-line pt-2">Received by {p.createdByLabel ?? ''}</p>
          <p className="border-t border-line pt-2">Checked / approved by</p>
        </div>
      </Card>
    </div>
  )
}
