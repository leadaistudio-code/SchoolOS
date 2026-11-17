'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { UserMinus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { dropOutStudentAction } from './actions'

export function DropOutStudentButton({
  studentId,
  name,
}: {
  studentId: string
  name: string
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
      const result = await dropOutStudentAction(studentId, reason.trim() || undefined)
      if (!result.ok) {
        setError(result.message ?? 'Could not mark as dropped out')
        return
      }
      toast.push({
        tone: 'success',
        title: 'Student marked as dropped out',
        description: 'Any unpaid fees now appear under Bad debts, not Outstanding.',
      })
      setOpen(false)
      router.refresh()
    })

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <UserMinus aria-hidden /> Drop out
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Mark ${name} as dropped out?`}
        footer={
          <>
            <Button variant="danger" loading={pending} onClick={confirm}>
              Mark as dropped out
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Keep
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-ink-muted">
          <p>
            They leave the current class roll and their portal login is switched off. Unpaid fees
            stop counting in Outstanding and move to Bad debts. Fee history and receipts are kept.
          </p>
          <Field label="Reason (optional)" htmlFor="dropout-reason">
            <Textarea
              id="dropout-reason"
              rows={2}
              maxLength={200}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          {error ? <p className="text-danger">{error}</p> : null}
        </div>
      </Dialog>
    </>
  )
}
