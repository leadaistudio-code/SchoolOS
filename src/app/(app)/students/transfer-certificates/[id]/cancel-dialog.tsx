'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Ban } from 'lucide-react'
import { cancelTcAction } from '../actions'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'

export function CancelTcDialog({ id, number }: { id: string; number: string }) {
  const router = useRouter()
  const { push } = useToast()
  const [open, setOpen] = React.useState(false)
  const [reason, setReason] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  const save = async () => {
    setSaving(true)
    const res = await cancelTcAction({ id, reason })
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
        <Ban aria-hidden /> Cancel TC
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Cancel ${number}?`}
        description="Use this when the certificate was issued by mistake or the student is staying. The student goes back to their earlier status and their login is switched back on. The certificate stays on record marked CANCELLED."
        footer={
          <>
            <Button variant="danger" onClick={save} disabled={saving || reason.trim().length < 3}>
              {saving ? 'Cancelling…' : 'Cancel certificate'}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Keep it</Button>
          </>
        }
      >
        <Field label="Reason" htmlFor="tc-cancel-reason" required>
          <Textarea
            id="tc-cancel-reason"
            autoFocus
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Parent withdrew the application"
          />
        </Field>
      </Dialog>
    </>
  )
}
