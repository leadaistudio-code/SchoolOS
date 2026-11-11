'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Ban, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { restoreCertificateAction, revokeCertificateAction } from './actions'

export function RevokeCertificateButton({ id, revoked }: { id: string; revoked: boolean }) {
  const router = useRouter()
  const { push } = useToast()
  const [open, setOpen] = React.useState(false)
  const [reason, setReason] = React.useState('')
  const [pending, startTransition] = React.useTransition()

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      const result = await action()
      push({ tone: result.ok ? 'success' : 'error', title: result.message })
      if (result.ok) {
        setOpen(false)
        setReason('')
        router.refresh()
      }
    })
  }

  if (revoked) {
    return (
      <Button variant="secondary" loading={pending} onClick={() => run(() => restoreCertificateAction(id))}>
        <RotateCcw /> Make valid again
      </Button>
    )
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Ban /> Revoke
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Revoke this certificate?"
        description="Anyone who scans its QR code will see that it was revoked. You can make it valid again later."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={pending} onClick={() => run(() => revokeCertificateAction(id, reason))}>
              Revoke certificate
            </Button>
          </>
        }
      >
        <Field label="Reason" htmlFor="rc-reason" hint="Kept in the audit log">
          <Textarea id="rc-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Issued in error: the project was submitted by someone else" />
        </Field>
      </Dialog>
    </>
  )
}
