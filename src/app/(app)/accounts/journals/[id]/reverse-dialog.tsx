'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { reverseJournalAction } from '../../actions'

export function ReverseJournalDialog({ id }: { id: string }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [reason, setReason] = React.useState('')
  const [pending, startTransition] = React.useTransition()

  const submit = () =>
    startTransition(async () => {
      const result = await reverseJournalAction({ id, reason })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Not reversed', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Voucher reversed', description: result.message })
      setOpen(false)
      router.refresh()
    })

  return (
    <>
      <Button size="sm" variant="danger" onClick={() => setOpen(true)}>Reverse voucher</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Reverse this voucher?"
        description="An opposite entry is posted today. The original stays in the books for the audit trail."
        footer={
          <>
            <Button variant="danger" loading={pending} disabled={reason.trim().length < 5} onClick={submit}>
              Confirm reversal
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Keep</Button>
          </>
        }
      >
        <Field label="Reason" htmlFor={`rev-${id}`} required>
          <Textarea id={`rev-${id}`} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        </Field>
      </Dialog>
    </>
  )
}
