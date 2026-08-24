'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Select, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'

/**
 * Oversight actions on one refresher — extend the window, or record an exemption.
 *
 * Both are acts of support, and both are deliberately explicit: an exemption
 * asks for a reason, and the server writes each to the audit log. There is no
 * "delete" or "reset score" here by design — this screen helps a teacher over a
 * line, it does not rewrite their record.
 */
export function OversightActions({
  assessmentId,
  status,
}: {
  assessmentId: string
  status: string
}) {
  const router = useRouter()
  const { push } = useToast()

  const [dialog, setDialog] = React.useState<null | 'extend' | 'exempt'>(null)
  const [hours, setHours] = React.useState('48')
  const [reason, setReason] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const canExtend = status === 'PENDING' || status === 'OVERDUE' || status === 'SCHEDULED'
  const canExempt = status !== 'COMPLETED' && status !== 'EXEMPTED'

  function close() {
    if (busy) return
    setDialog(null)
    setReason('')
    setHours('48')
  }

  async function submit(path: 'extend' | 'exempt', body: Record<string, unknown>, done: string) {
    setBusy(true)
    try {
      const res = await fetch(`/api/v1/teacher-refresh/${assessmentId}/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await res.json()
      if (!res.ok) {
        push({
          tone: 'error',
          title: 'Could not complete that',
          description: payload?.error?.message ?? 'Please try again.',
        })
        return
      }
      push({ tone: 'success', title: done })
      setDialog(null)
      setReason('')
      setHours('48')
      router.refresh()
    } catch {
      push({ tone: 'error', title: 'Network error', description: 'Please try again.' })
    } finally {
      setBusy(false)
    }
  }

  if (!canExtend && !canExempt) {
    return <span className="text-xs text-ink-subtle">—</span>
  }

  return (
    <>
      <div className="flex items-center justify-end gap-1">
        {canExtend ? (
          <Button variant="ghost" size="sm" onClick={() => setDialog('extend')}>
            <CalendarClock aria-hidden />
            Extend
          </Button>
        ) : null}
        {canExempt ? (
          <Button variant="ghost" size="sm" onClick={() => setDialog('exempt')}>
            <ShieldCheck aria-hidden />
            Exempt
          </Button>
        ) : null}
      </div>

      <Dialog
        open={dialog === 'extend'}
        onClose={close}
        title="Extend the window"
        description="Give this teacher more time to finish. An overdue refresher re-opens."
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button
              onClick={() => submit('extend', { hours: Number(hours) }, 'Window extended')}
              loading={busy}
            >
              Extend
            </Button>
          </>
        }
      >
        <Field label="Extra time" htmlFor="extend-hours">
          <Select id="extend-hours" value={hours} onChange={(e) => setHours(e.target.value)}>
            <option value="24">1 more day</option>
            <option value="48">2 more days</option>
            <option value="72">3 more days</option>
            <option value="168">1 more week</option>
            <option value="336">2 more weeks</option>
          </Select>
        </Field>
      </Dialog>

      <Dialog
        open={dialog === 'exempt'}
        onClose={close}
        title="Record an exemption"
        description="Waive this refresher for the teacher. The reason is kept on record."
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button
              onClick={() => submit('exempt', { reason: reason.trim() }, 'Exemption recorded')}
              loading={busy}
              disabled={reason.trim().length === 0}
            >
              Record exemption
            </Button>
          </>
        }
      >
        <Field label="Reason" htmlFor="exempt-reason" hint="On leave, covered elsewhere, and so on.">
          <Textarea
            id="exempt-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Why is this teacher exempt from this refresher?"
            autoFocus
          />
        </Field>
      </Dialog>
    </>
  )
}
