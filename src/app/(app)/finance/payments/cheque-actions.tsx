'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { bounceChequeAction, clearChequeAction } from '../actions'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Clear / Bounce controls for a cheque receipt that is pending clearance. */
export function ChequeActions({ paymentId, size = 'sm' }: { paymentId: string; size?: 'sm' | 'md' }) {
  const router = useRouter()
  const toast = useToast()
  const [mode, setMode] = React.useState<'clear' | 'bounce' | null>(null)
  const [clearedOn, setClearedOn] = React.useState(todayIso())
  const [reason, setReason] = React.useState('')
  const [pending, startTransition] = React.useTransition()

  const submit = () =>
    startTransition(async () => {
      const result = mode === 'clear'
        ? await clearChequeAction({ paymentId, clearedOn })
        : await bounceChequeAction({ paymentId, reason })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Not updated', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: mode === 'clear' ? 'Cheque cleared' : 'Cheque bounced', description: result.message })
      setMode(null)
      setReason('')
      router.refresh()
    })

  return (
    <>
      <span className="inline-flex gap-1.5">
        <Button size={size} variant="secondary" onClick={() => setMode('clear')}>
          Mark cleared
        </Button>
        <Button size={size} variant="ghost" onClick={() => setMode('bounce')}>
          Bounced
        </Button>
      </span>
      <Dialog
        open={mode !== null}
        onClose={() => setMode(null)}
        title={mode === 'clear' ? 'Mark cheque as cleared' : 'Mark cheque as bounced'}
        description={
          mode === 'clear'
            ? 'The amount will be applied to the dues this cheque was collected for, and posted to the books and Tally.'
            : 'The receipt will show as bounced and the student’s dues stay open. Nothing is posted to the books.'
        }
        footer={
          <>
            <Button
              variant={mode === 'bounce' ? 'danger' : 'primary'}
              loading={pending}
              disabled={mode === 'bounce' ? reason.trim().length < 3 : !clearedOn}
              onClick={submit}
            >
              {mode === 'clear' ? 'Confirm cleared' : 'Confirm bounced'}
            </Button>
            <Button variant="ghost" onClick={() => setMode(null)}>
              Close
            </Button>
          </>
        }
      >
        {mode === 'clear' ? (
          <Field label="Cleared on (bank date)" htmlFor={`cleared-${paymentId}`} required>
            <Input
              id={`cleared-${paymentId}`}
              type="date"
              value={clearedOn}
              max={todayIso()}
              onChange={(e) => setClearedOn(e.target.value)}
            />
          </Field>
        ) : (
          <Field label="Bank return reason" htmlFor={`bounce-${paymentId}`} required>
            <Textarea
              id={`bounce-${paymentId}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              autoFocus
              placeholder="Insufficient funds, signature mismatch…"
            />
          </Field>
        )}
      </Dialog>
    </>
  )
}
