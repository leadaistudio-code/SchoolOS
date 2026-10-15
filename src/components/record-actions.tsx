'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'

type Result = { ok: boolean; message?: string }

/** Soft-delete with a confirmation dialog; the record can be restored later. */
export function DeleteRecordButton({
  label,
  title,
  children,
  action,
  askReason = false,
  redirectTo,
  doneMessage,
}: {
  label: string
  title: string
  children: React.ReactNode
  action: (reason?: string) => Promise<Result>
  askReason?: boolean
  redirectTo?: string
  doneMessage: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [reason, setReason] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  const confirm = () =>
    startTransition(async () => {
      setError(null)
      const result = await action(askReason ? reason : undefined)
      if (!result.ok) {
        setError(result.message ?? 'Could not delete')
        return
      }
      toast.push({ tone: 'success', title: doneMessage })
      setOpen(false)
      if (redirectTo) router.push(redirectTo)
      else router.refresh()
    })

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <Trash2 aria-hidden /> {label}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        footer={
          <>
            <Button variant="danger" loading={pending} onClick={confirm}>
              {label}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Keep
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-ink-muted">
          {children}
          {askReason ? (
            <Field label="Reason (optional)" htmlFor="delete-reason">
              <Textarea
                id="delete-reason"
                rows={2}
                maxLength={200}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          ) : null}
          {error ? <p className="text-danger">{error}</p> : null}
        </div>
      </Dialog>
    </>
  )
}

export function RestoreRecordButton({
  action,
  doneMessage,
}: {
  action: () => Promise<Result>
  doneMessage: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = React.useTransition()

  const restore = () =>
    startTransition(async () => {
      const result = await action()
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not restore', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: doneMessage })
      router.refresh()
    })

  return (
    <Button size="sm" variant="secondary" loading={pending} onClick={restore}>
      <RotateCcw aria-hidden /> Restore
    </Button>
  )
}
