'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Undo2 } from 'lucide-react'
import { refundPaymentAction } from '../../actions'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { formatMoney } from '@/lib/utils'

/**
 * Refunds require a reason and are capped at the unrefunded remainder. The
 * server enforces both; this only makes the limit visible before the click.
 */
export function RefundDialog({
  paymentId,
  maxMinor,
  currency,
}: {
  paymentId: string
  maxMinor: number
  currency: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [amount, setAmount] = React.useState(String(maxMinor / 100))
  const [reason, setReason] = React.useState('')
  const [pending, startTransition] = React.useTransition()

  if (maxMinor <= 0) return null

  const submit = () => {
    startTransition(async () => {
      const result = await refundPaymentAction({
        paymentId,
        amount: Number(amount),
        reason,
      })
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title: result.ok ? 'Refunded' : 'Refund failed',
        description: result.message,
      })
      if (result.ok) {
        setOpen(false)
        router.refresh()
      }
    })
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Undo2 aria-hidden />
        Refund
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Refund payment"
        size="sm"
        description={`Up to ${formatMoney(maxMinor, currency)} can be refunded. The invoice balance is restored automatically.`}
        footer={
          <>
            <Button
              variant="danger"
              onClick={submit}
              loading={pending}
              disabled={reason.trim().length < 5 || Number(amount) <= 0}
            >
              Refund {formatMoney(Math.round(Number(amount || 0) * 100), currency)}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Amount" htmlFor="refund-amount" required>
            <Input
              id="refund-amount"
              type="number"
              min={1}
              max={maxMinor / 100}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="tnum"
            />
          </Field>

          <Field
            label="Reason"
            htmlFor="refund-reason"
            required
            hint="Recorded in the audit log with your name"
          >
            <Textarea
              id="refund-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Duplicate payment collected in error"
            />
          </Field>
        </div>
      </Dialog>
    </>
  )
}
