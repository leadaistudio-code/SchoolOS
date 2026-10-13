'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays } from 'lucide-react'
import { setInvoiceDatesAction } from '../actions'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'

/** Changes one invoice's invoice (generation) date and due date. */
export function InvoiceDatesButton({
  invoice,
  size = 'sm',
  label = 'Edit dates',
  onSaved,
}: {
  invoice: { id: string; number: string; issuedOn: string; dueOn: string }
  size?: 'sm' | 'md'
  label?: string
  onSaved?: () => void
}) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [issuedOn, setIssuedOn] = React.useState(invoice.issuedOn.slice(0, 10))
  const [dueOn, setDueOn] = React.useState(invoice.dueOn.slice(0, 10))
  const [reason, setReason] = React.useState('')
  const [pending, startTransition] = React.useTransition()

  const openDialog = () => {
    setIssuedOn(invoice.issuedOn.slice(0, 10))
    setDueOn(invoice.dueOn.slice(0, 10))
    setReason('')
    setOpen(true)
  }

  const invalid = !issuedOn || !dueOn || issuedOn > dueOn
  const unchanged = issuedOn === invoice.issuedOn.slice(0, 10) && dueOn === invoice.dueOn.slice(0, 10)

  const save = () => startTransition(async () => {
    const result = await setInvoiceDatesAction({
      invoiceId: invoice.id,
      issuedOn,
      dueOn,
      reason: reason.trim() || undefined,
    })
    toast.push({
      tone: result.ok ? 'success' : 'error',
      title: result.ok ? 'Dates updated' : 'Dates not updated',
      description: result.message,
    })
    if (!result.ok) return
    setOpen(false)
    onSaved?.()
    router.refresh()
  })

  return (
    <>
      <Button variant="secondary" size={size} onClick={openDialog}>
        <CalendarDays aria-hidden />
        {label}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Dates for ${invoice.number}`}
        size="sm"
        description="Amounts, payments and receipts stay as they are. The overdue status follows the new due date."
        footer={
          <>
            <Button onClick={save} loading={pending} disabled={invalid || unchanged}>Save dates</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Invoice date" htmlFor={`issued-${invoice.id}`} required>
              <Input id={`issued-${invoice.id}`} type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />
            </Field>
            <Field label="Due date" htmlFor={`due-${invoice.id}`} required>
              <Input id={`due-${invoice.id}`} type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
            </Field>
          </div>
          {issuedOn && dueOn && issuedOn > dueOn ? (
            <p className="text-xs text-[var(--danger)]">The due date cannot be before the invoice date.</p>
          ) : null}
          <Field label="Reason" htmlFor={`reason-${invoice.id}`} hint="Optional · kept in the audit log">
            <Input id={`reason-${invoice.id}`} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>
      </Dialog>
    </>
  )
}
