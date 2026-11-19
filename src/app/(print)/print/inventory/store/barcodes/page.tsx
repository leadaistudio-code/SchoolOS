import { redirect } from 'next/navigation'

/** Legacy/wrong prefix — `(print)` is a route group and does not add `/print` to URLs. */
export default async function StoreBarcodeLabelsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) qs.set(key, value)
  }
  const suffix = qs.toString()
  redirect(`/inventory/store/barcodes${suffix ? `?${suffix}` : ''}`)
}
