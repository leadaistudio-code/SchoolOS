'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Barcode, Printer } from 'lucide-react'
import { bulkGenerateStoreBarcodesAction } from '../actions'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

export function BulkBarcodeActions({
  missingCount,
  canManage,
}: {
  missingCount: number
  canManage: boolean
}) {
  const router = useRouter()
  const { push } = useToast()
  const [busy, setBusy] = React.useState(false)

  const generate = async () => {
    setBusy(true)
    const res = await bulkGenerateStoreBarcodesAction()
    setBusy(false)
    push({ tone: res.ok ? 'success' : 'error', title: res.message })
    if (res.ok) {
      router.refresh()
      if (res.message.includes('Generated')) {
        window.open('/inventory/store/barcodes', '_blank', 'noopener,noreferrer')
      }
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canManage && missingCount > 0 ? (
        <Button size="sm" variant="secondary" disabled={busy} onClick={generate}>
          <Barcode aria-hidden />
          {busy
            ? 'Generating…'
            : `Generate unique barcodes (${missingCount} piece${missingCount === 1 ? '' : 's'})`}
        </Button>
      ) : null}
      <a
        href="/inventory/store/barcodes"
        target="_blank"
        rel="noopener noreferrer"
        className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}
      >
        <Printer aria-hidden /> Print barcode labels
      </a>
    </div>
  )
}

export function ItemBarcodePrintButton({
  itemId,
  hasBarcode,
  unitCount = 0,
}: {
  itemId: string
  hasBarcode: boolean
  /** In-stock pieces with unique barcodes — print one label each. */
  unitCount?: number
}) {
  if (!hasBarcode && unitCount <= 0) return null
  return (
    <a
      href={`/inventory/store/barcodes?ids=${itemId}`}
      target="_blank"
      rel="noopener noreferrer"
      title={unitCount > 0 ? `Print ${unitCount} unique barcode label${unitCount === 1 ? '' : 's'}` : 'Print barcode label'}
      className="grid size-8 place-items-center rounded-[var(--radius-sm)] text-ink-muted hover:bg-surface-2 hover:text-ink"
    >
      <Barcode className="size-3.5" aria-label="Print barcode labels" />
    </a>
  )
}
