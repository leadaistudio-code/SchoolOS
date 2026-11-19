import { requireContext } from '@/server/context'
import { listStoreItemsForBarcodes } from '@/server/modules/store/service'
import { itemLabel } from '@/lib/store/options'
import { Barcode } from '@/components/print/barcode'
import { SimplePrintBar } from '@/app/(print)/simple-print-bar'
import { formatMoney } from '@/lib/utils'

export const metadata = { title: 'Store barcode labels' }

export default async function StoreBarcodeLabelsPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string; purchaseId?: string; missing?: string }>
}) {
  const ctx = await requireContext('store.view')
  const params = await searchParams
  const ids = params.ids?.split(',').map((s) => s.trim()).filter(Boolean)
  let items = await listStoreItemsForBarcodes(ctx, {
    ids: ids?.length ? ids : undefined,
    purchaseId: params.purchaseId,
    missingOnly: params.missing === '1',
  })

  // Only print labels that have a barcode value.
  items = items.filter((i) => i.barcode?.trim())
  const school = ctx.tenant.school?.name ?? ctx.tenant.name
  const currency = ctx.tenant.currency

  return (
    <div className="mx-auto max-w-[210mm] px-4 py-6 print:max-w-none print:p-0">
      <SimplePrintBar backHref="/inventory/store/items" backLabel="Back to items" />
      <div className="no-print mb-4 space-y-1">
        <h1 className="text-lg font-semibold text-neutral-900">Barcode labels</h1>
        <p className="text-sm text-neutral-600">
          {items.length} unique label{items.length === 1 ? '' : 's'} for {school} — one barcode per
          individual piece. Stick each label on its item so the counter can scan it.
        </p>
      </div>

      {items.length === 0 ? (
        <p className="rounded border border-dashed border-neutral-300 px-4 py-10 text-center text-sm text-neutral-600">
          No barcodes to print. Generate barcodes on Items &amp; stock first.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3 print:gap-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="break-inside-avoid rounded border border-neutral-300 bg-white px-2 py-2.5 text-center"
            >
              <p className="truncate text-[11px] font-semibold leading-tight text-neutral-900">
                {itemLabel(item)}
              </p>
              <p className="truncate text-[9px] text-neutral-500">{school}</p>
              <div className="mt-1.5 px-1">
                <Barcode value={item.barcode!} height={12} label={item.barcode!} />
              </div>
              <p className="mt-1 text-[11px] font-semibold tnum text-neutral-900">
                {formatMoney(item.sellingPriceMinor, currency)}
                <span className="font-normal text-neutral-500"> / {item.unit}</span>
              </p>
              <p className="truncate text-[9px] text-neutral-500">{item.sku}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
