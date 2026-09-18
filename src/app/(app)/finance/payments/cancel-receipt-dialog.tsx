'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { reversePaymentAction } from '../actions'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'

/** Cancels a posted counter receipt (same as reversePayment). */
export function CancelReceiptDialog({
  paymentId,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  paymentId: string
  /** When omitted, renders the page-level danger button. */
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const router = useRouter()
  const toast = useToast()
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = onOpenChange ?? setUncontrolledOpen
  const [reason, setReason] = React.useState('')
  const [pending, startTransition] = React.useTransition()

  const cancel = () =>
    startTransition(async () => {
      const result = await reversePaymentAction({ paymentId, reason })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Receipt not cancelled', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Receipt cancelled', description: result.message })
      setOpen(false)
      setReason('')
      router.refresh()
    })

  return (
    <>
      {trigger ? (
        <span onClick={() => setOpen(true)}>{trigger}</span>
      ) : controlledOpen === undefined ? (
        <Button size="sm" variant="danger" onClick={() => setOpen(true)}>
          Cancel receipt
        </Button>
      ) : null}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Cancel this receipt?"
        description="The original receipt stays in the audit trail. Invoice balances will be restored so you can collect again if needed."
        footer={
          <>
            <Button
              variant="danger"
              loading={pending}
              disabled={reason.trim().length < 5}
              onClick={cancel}
            >
              Confirm cancel
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Keep receipt
            </Button>
          </>
        }
      >
        <Field label="Reason" htmlFor={`cancel-reason-${paymentId}`} required>
          <Textarea
            id={`cancel-reason-${paymentId}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            autoFocus
            placeholder="Wrong amount, duplicate entry, student paid elsewhere…"
          />
        </Field>
      </Dialog>
    </>
  )
}

/** @deprecated Prefer CancelReceiptDialog — same behaviour, clearer label. */
export function ReversePaymentDialog(props: { paymentId: string }) {
  return <CancelReceiptDialog paymentId={props.paymentId} />
}
