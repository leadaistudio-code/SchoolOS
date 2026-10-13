import Link from 'next/link'
import { ShoppingCart } from 'lucide-react'
import { requireContext } from '@/server/context'
import { getStoreSale } from '@/server/modules/store/service'
import { storePaymentLabel } from '@/lib/store/options'
import { PageHeader } from '@/components/page-header'
import { BackButton } from '@/components/back-button'
import { buttonVariants } from '@/components/ui/button-variants'
import { formatMoney } from '@/lib/utils'
import { PrintButton } from '@/app/(app)/finance/payments/[id]/print-button'
import { AutoPrint } from '@/app/(app)/exams/report-cards/engine-controls'
import { VoidSaleDialog } from './void-dialog'

export const metadata = { title: 'Store bill' }

const STAMP = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

export default async function StoreSalePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ print?: string }>
}) {
  const ctx = await requireContext('store.view')
  const [{ id }, { print }] = await Promise.all([params, searchParams])
  const [sale, details] = await Promise.all([
    getStoreSale(ctx, id),
    ctx.db.school.findFirst({ select: { addressLine1: true, city: true, phone: true, taxNumber: true } }),
  ])
  const school = ctx.tenant.school
  const currency = ctx.tenant.currency
  const voided = sale.status === 'VOIDED'
  const enrollment = sale.student?.enrollments[0]
  const classLabel = enrollment
    ? `${enrollment.classLevel?.name ?? ''}${enrollment.section?.name ? `-${enrollment.section.name}` : ''}`
    : null
  const taxByRate = new Map<number, number>()
  for (const l of sale.lines) if (l.taxMinor > 0) taxByRate.set(l.taxPercent, (taxByRate.get(l.taxPercent) ?? 0) + l.taxMinor)

  return (
    <div className="mx-auto max-w-xl space-y-4">
      {print === '1' && !voided ? <AutoPrint /> : null}
      <div className="no-print">
        <PageHeader
          title={sale.number}
          description={voided ? `Voided: ${sale.voidReason ?? ''}` : `Sold by ${sale.soldByLabel ?? 'staff'} · ${STAMP.format(sale.soldAt)}`}
          actions={
            <>
              <PrintButton />
              {ctx.can('store.sell') ? (
                <Link href="/inventory/store/sell" className={buttonVariants({ size: 'sm' })}>
                  <ShoppingCart aria-hidden /> New bill
                </Link>
              ) : null}
              {!voided && ctx.can('store.void') ? <VoidSaleDialog saleId={sale.id} number={sale.number} /> : null}
              <BackButton fallbackHref="/inventory/store/sales" />
            </>
          }
        />
      </div>

      <article className="relative overflow-hidden rounded-xl border border-line bg-surface p-6 text-ink shadow-[var(--shadow-card)] print:rounded-none print:border-0 print:p-0 print:shadow-none">
        {voided ? (
          <span className="pointer-events-none absolute right-6 top-16 rotate-[-14deg] rounded-md border-4 border-[var(--danger)] px-3 py-1 text-3xl font-black tracking-widest text-[var(--danger)] opacity-70">
            VOID
          </span>
        ) : null}
        <header className="border-b border-dashed border-line pb-4 text-center">
          {school?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={school.logoUrl} alt="" className="mx-auto mb-2 h-12 w-auto object-contain" />
          ) : null}
          <p className="text-lg font-bold">{school?.name ?? ctx.tenant.name}</p>
          {details?.addressLine1 || details?.city ? (
            <p className="text-xs text-ink-muted">{[details.addressLine1, details.city].filter(Boolean).join(', ')}</p>
          ) : null}
          {details?.phone ? <p className="text-xs text-ink-muted">Ph: {details.phone}</p> : null}
          {details?.taxNumber ? <p className="text-xs text-ink-muted">GSTIN: {details.taxNumber}</p> : null}
          <p className="mt-2 text-sm font-semibold uppercase tracking-wider">School store · {sale.taxMinor > 0 ? 'Tax invoice' : 'Cash memo'}</p>
        </header>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-b border-dashed border-line py-3 text-sm">
          <dt className="text-ink-muted">Bill no.</dt>
          <dd className="text-right font-semibold tnum">{sale.number}</dd>
          <dt className="text-ink-muted">Date</dt>
          <dd className="text-right">{STAMP.format(sale.soldAt)}</dd>
          <dt className="text-ink-muted">Sold to</dt>
          <dd className="text-right">
            {sale.student ? `${sale.student.firstName} ${sale.student.lastName}` : sale.customerName ?? 'Walk-in'}
          </dd>
          {sale.student ? (
            <>
              <dt className="text-ink-muted">Adm. no. / class</dt>
              <dd className="text-right">{[sale.student.admissionNo, classLabel].filter(Boolean).join(' · ')}</dd>
            </>
          ) : null}
          {sale.customerPhone ? (
            <>
              <dt className="text-ink-muted">Phone</dt>
              <dd className="text-right">{sale.customerPhone}</dd>
            </>
          ) : null}
        </dl>

        <table className="w-full border-b border-dashed border-line text-sm">
          <thead>
            <tr className="text-xs text-ink-muted">
              <th className="py-2 text-left font-medium">Item</th>
              <th className="py-2 text-right font-medium">Qty</th>
              <th className="py-2 text-right font-medium">Rate</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {sale.lines.map((l) => (
              <tr key={l.id} className="align-top">
                <td className="py-1.5">
                  <p>{l.description}</p>
                  <p className="text-[11px] text-ink-subtle">
                    {[l.item.sku, l.item.hsnCode && `HSN ${l.item.hsnCode}`, l.taxPercent ? `GST ${l.taxPercent}%` : null, l.discountMinor ? `disc ${formatMoney(l.discountMinor, currency)}` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </td>
                <td className="py-1.5 text-right tnum">{l.quantity}</td>
                <td className="py-1.5 text-right tnum">{formatMoney(l.unitPriceMinor, currency)}</td>
                <td className="py-1.5 text-right font-medium tnum">{formatMoney(l.amountMinor, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="space-y-1 py-3 text-sm">
          <div className="flex justify-between text-ink-muted">
            <dt>Items total</dt>
            <dd className="tnum">{formatMoney(sale.grossMinor, currency)}</dd>
          </div>
          {sale.discountMinor > 0 ? (
            <div className="flex justify-between text-ink-muted">
              <dt>Discount</dt>
              <dd className="tnum">− {formatMoney(sale.discountMinor, currency)}</dd>
            </div>
          ) : null}
          {[...taxByRate.entries()].map(([rate, tax]) => (
            <div key={rate} className="flex justify-between text-xs text-ink-subtle">
              <dt>Incl. GST {rate}% (CGST {rate / 2}% + SGST {rate / 2}%)</dt>
              <dd className="tnum">{formatMoney(tax, currency)}</dd>
            </div>
          ))}
          <div className="flex justify-between border-t border-line pt-2 text-lg font-bold">
            <dt>Total paid</dt>
            <dd className="tnum">{formatMoney(sale.totalMinor, currency)}</dd>
          </div>
          <div className="flex justify-between text-ink-muted">
            <dt>Payment</dt>
            <dd>{storePaymentLabel(sale.paymentMode)}{sale.paymentRef ? ` · ${sale.paymentRef}` : ''}</dd>
          </div>
        </dl>

        <footer className="border-t border-dashed border-line pt-3 text-center text-xs text-ink-subtle">
          <p>Goods once sold can be exchanged within 7 days with this bill, if unused and in original condition.</p>
          <p className="mt-1">Thank you! · Computer-generated bill, no signature required.</p>
        </footer>
      </article>
    </div>
  )
}
