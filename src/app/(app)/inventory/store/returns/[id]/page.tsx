import Link from 'next/link'
import { requireContext } from '@/server/context'
import { getStoreReturn } from '@/server/modules/store/returns'
import { storePaymentLabel } from '@/lib/store/options'
import { PageHeader } from '@/components/page-header'
import { BackButton } from '@/components/back-button'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { buttonVariants } from '@/components/ui/button-variants'
import { formatMoney } from '@/lib/utils'

export const metadata = { title: 'Store return' }

const STAMP = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

export default async function StoreReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext('store.view')
  const { id } = await params
  const row = await getStoreReturn(ctx, id)
  const currency = ctx.tenant.currency

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title={row.number}
        description={`${row.kind === 'EXCHANGE' ? 'Exchange' : 'Return'} against ${row.sale.number} · ${STAMP.format(row.createdAt)} by ${row.createdByLabel ?? 'staff'}`}
        actions={
          <>
            <Link href={`/inventory/store/sales/${row.sale.id}`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              Original bill
            </Link>
            {row.exchangeSale ? (
              <Link href={`/inventory/store/sales/${row.exchangeSale.id}`} className={buttonVariants({ size: 'sm' })}>
                Replacement bill
              </Link>
            ) : null}
            <BackButton fallbackHref="/inventory/store/returns" />
          </>
        }
      />

      <Card className="space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={row.kind} label={row.kind === 'EXCHANGE' ? 'Exchange' : 'Return'} tone={row.kind === 'EXCHANGE' ? 'info' : 'warning'} />
          {row.refundMinor > 0 ? (
            <span className="text-sm text-ink-muted">
              Refund {formatMoney(row.refundMinor, currency)} via {storePaymentLabel(row.refundMode ?? 'CASH')}
            </span>
          ) : null}
          {row.collectedMinor > 0 ? (
            <span className="text-sm text-ink-muted">
              Collected {formatMoney(row.collectedMinor, currency)} via {storePaymentLabel(row.collectedMode ?? 'CASH')}
            </span>
          ) : null}
        </div>
        {row.notes ? <p className="text-sm text-ink-muted">{row.notes}</p> : null}

        <div>
          <h2 className="mb-2 text-sm font-semibold text-ink">Goods returned</h2>
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Item</TH>
                  <TH align="right">Qty</TH>
                  <TH align="right">Value</TH>
                </tr>
              </THead>
              <TBody>
                {row.lines.map((l) => (
                  <TR key={l.id}>
                    <TD>
                      <p className="text-sm text-ink">{l.saleLine.description}</p>
                      <p className="text-xs text-ink-subtle">{l.item.sku}</p>
                    </TD>
                    <TD align="right">
                      {l.quantity} {l.item.unit}
                    </TD>
                    <TD align="right">{formatMoney(l.amountMinor, currency)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </div>

        {row.exchangeSale ? (
          <div>
            <h2 className="mb-2 text-sm font-semibold text-ink">Replacement bill {row.exchangeSale.number}</h2>
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Item</TH>
                    <TH align="right">Qty</TH>
                    <TH align="right">Amount</TH>
                  </tr>
                </THead>
                <TBody>
                  {row.exchangeSale.lines.map((l) => (
                    <TR key={l.id}>
                      <TD>{l.description}</TD>
                      <TD align="right">
                        {l.quantity} {l.item.unit}
                      </TD>
                      <TD align="right">{formatMoney(l.amountMinor, currency)}</TD>
                    </TR>
                  ))}
                  <tr className="bg-surface-2 font-medium">
                    <TD colSpan={2}>Total</TD>
                    <TD align="right">{formatMoney(row.exchangeSale.totalMinor, currency)}</TD>
                  </tr>
                </TBody>
              </Table>
            </TableWrap>
          </div>
        ) : null}
      </Card>
    </div>
  )
}