'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { editPaymentAction } from '../actions'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { toDateInput } from '@/lib/dates'

const MODES = [
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'CARD', label: 'Card' },
  { value: 'NET_BANKING', label: 'Net banking' },
] as const

export type EditReceiptValues = {
  paymentId: string
  mode: string
  paidOn: string
  reference?: string | null
  billBookNo?: string | null
  notes?: string | null
}

/** Edits receipt metadata only — not the paid amount. */
export function EditReceiptDialog({
  values,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  values: EditReceiptValues
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const router = useRouter()
  const toast = useToast()
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = onOpenChange ?? setUncontrolledOpen
  const [mode, setMode] = React.useState(values.mode)
  const [paidOn, setPaidOn] = React.useState(values.paidOn || toDateInput(new Date()))
  const [reference, setReference] = React.useState(values.reference ?? '')
  const [billBookNo, setBillBookNo] = React.useState(values.billBookNo ?? '')
  const [notes, setNotes] = React.useState(values.notes ?? '')
  const [pending, startTransition] = React.useTransition()

  React.useEffect(() => {
    if (!open) return
    setMode(values.mode)
    setPaidOn(values.paidOn || toDateInput(new Date()))
    setReference(values.reference ?? '')
    setBillBookNo(values.billBookNo ?? '')
    setNotes(values.notes ?? '')
  }, [open, values])

  const save = () =>
    startTransition(async () => {
      const result = await editPaymentAction({
        paymentId: values.paymentId,
        mode,
        paidOn,
        reference,
        billBookNo,
        notes,
      })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Receipt not updated', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Receipt updated', description: result.message })
      setOpen(false)
      router.refresh()
    })

  return (
    <>
      {trigger ? (
        <span onClick={() => setOpen(true)}>{trigger}</span>
      ) : controlledOpen === undefined ? (
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          Edit receipt
        </Button>
      ) : null}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Edit receipt"
        description="Change date, mode, reference or notes. To change the amount, cancel this receipt and collect again."
        footer={
          <>
            <Button loading={pending} onClick={save}>
              Save changes
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Payment date" htmlFor={`edit-paidOn-${values.paymentId}`} required>
            <Input
              id={`edit-paidOn-${values.paymentId}`}
              type="date"
              value={paidOn}
              onChange={(e) => setPaidOn(e.target.value)}
            />
          </Field>
          <Field label="Mode" htmlFor={`edit-mode-${values.paymentId}`} required>
            <Select
              id={`edit-mode-${values.paymentId}`}
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              {MODES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reference / UTR" htmlFor={`edit-reference-${values.paymentId}`}>
            <Input
              id={`edit-reference-${values.paymentId}`}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </Field>
          <Field label="Bill book number" htmlFor={`edit-bill-${values.paymentId}`}>
            <Input
              id={`edit-bill-${values.paymentId}`}
              value={billBookNo}
              onChange={(e) => setBillBookNo(e.target.value)}
            />
          </Field>
          <Field
            label="Notes"
            htmlFor={`edit-notes-${values.paymentId}`}
            className="sm:col-span-2"
          >
            <Textarea
              id={`edit-notes-${values.paymentId}`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </Field>
        </div>
      </Dialog>
    </>
  )
}
