'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Ban } from 'lucide-react'
import { voidStoreSaleAction } from '../../actions'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'

export function VoidSaleDialog({ saleId, number }: { saleId: string; number: string }) {
  const router = useRouter()
  const { push } = useToast()
  const [open, setOpen] = React.useState(false)
  const [reason, setReason] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  const save = async () => {
    setSaving(true)
    const res = await voidStoreSaleAction(saleId, reason)
    setSaving(false)
    push({ tone: res.ok ? 'success' : 'error', title: res.message })
    if (res.ok) {
      setOpen(false)
      router.refresh()
    }
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Ban aria-hidden /> Void bill
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Void ${number}?`}
        description="Use this when goods come back or the bill was wrong. Every item returns to stock, the accounts entry is reversed, and the bill stays on record marked VOID."
        footer={
          <>
            <Button variant="danger" onClick={save} disabled={saving || reason.trim().length < 3}>
              {saving ? 'Voiding…' : 'Void bill & return stock'}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Keep bill</Button>
          </>
        }
      >
        <Field label="Reason" htmlFor="void-reason" required>
          <Textarea id="void-reason" autoFocus rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Wrong size, exchanged for size 34" />
        </Field>
      </Dialog>
    </>
  )
}
