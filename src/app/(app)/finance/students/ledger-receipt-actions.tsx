'use client'

import * as React from 'react'
import Link from 'next/link'
import { MoreHorizontal, Printer } from 'lucide-react'
import { CancelReceiptDialog } from '../payments/cancel-receipt-dialog'
import { EditReceiptDialog } from '../payments/edit-receipt-dialog'
import { buttonVariants } from '@/components/ui/button-variants'

export type LedgerPaymentAction = {
  paymentId: string
  provider: string | null
  status: string
  mode: string
  paidOn: string | null
  billBookNo: string | null
  paymentReference: string | null
  notes: string | null
}

export function LedgerReceiptActions({
  payment,
  canCancel,
  canEdit,
}: {
  payment: LedgerPaymentAction
  canCancel: boolean
  canEdit: boolean
}) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [cancelOpen, setCancelOpen] = React.useState(false)
  const [editOpen, setEditOpen] = React.useState(false)
  const rootRef = React.useRef<HTMLDivElement>(null)

  const isManualSuccess =
    payment.status === 'SUCCESS' && (payment.provider === 'manual' || !payment.provider)

  React.useEffect(() => {
    if (!menuOpen) return
    const onPointer = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  return (
    <div className="relative flex justify-end" ref={rootRef}>
      <button
        type="button"
        className={buttonVariants({ size: 'sm', variant: 'ghost' })}
        aria-label="Receipt actions"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <MoreHorizontal className="size-4" aria-hidden />
      </button>
      {menuOpen ? (
        <div className="absolute right-0 top-full z-20 mt-1 min-w-44 rounded-md border border-[var(--border)] bg-[var(--surface)] py-1 shadow-md">
          <Link
            href={`/finance/payments/${payment.paymentId}`}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-ink hover:bg-[var(--surface-2)]"
            onClick={() => setMenuOpen(false)}
          >
            <Printer className="size-3.5 text-ink-subtle" aria-hidden />
            Print receipt
          </Link>
          {canEdit && isManualSuccess ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink hover:bg-[var(--surface-2)]"
              onClick={() => {
                setMenuOpen(false)
                setEditOpen(true)
              }}
            >
              Edit receipt
            </button>
          ) : null}
          {canCancel && isManualSuccess ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--danger)] hover:bg-[var(--surface-2)]"
              onClick={() => {
                setMenuOpen(false)
                setCancelOpen(true)
              }}
            >
              Cancel receipt
            </button>
          ) : null}
        </div>
      ) : null}

      <CancelReceiptDialog
        paymentId={payment.paymentId}
        open={cancelOpen}
        onOpenChange={setCancelOpen}
      />
      <EditReceiptDialog
        values={{
          paymentId: payment.paymentId,
          mode: payment.mode,
          paidOn: payment.paidOn ?? '',
          reference: payment.paymentReference,
          billBookNo: payment.billBookNo,
          notes: payment.notes,
        }}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </div>
  )
}
