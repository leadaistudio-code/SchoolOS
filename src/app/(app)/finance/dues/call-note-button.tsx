'use client'

import * as React from 'react'
import { Phone } from 'lucide-react'
import { createFeeCallNoteAction } from '../actions'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { formatDay } from '@/lib/dates'

function localDateTimeValue(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function CallNoteButton({
  studentId,
  studentName,
  phone,
  telHref,
  contactLabel,
  lastCallAt,
  lastCallNotes,
}: {
  studentId: string
  studentName: string
  phone: string | null
  telHref: string | null
  contactLabel: string | null
  lastCallAt: Date | string | null
  lastCallNotes: string | null
}) {
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [notes, setNotes] = React.useState('')
  const [calledAt, setCalledAt] = React.useState(localDateTimeValue)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  const openDialog = () => {
    setNotes('')
    setCalledAt(localDateTimeValue())
    setError(null)
    setOpen(true)
  }

  const save = () =>
    startTransition(async () => {
      setError(null)
      const result = await createFeeCallNoteAction({ studentId, notes, calledAt })
      if (!result.ok) {
        setError(result.message ?? 'Could not save')
        return
      }
      toast.push({ tone: 'success', title: 'Call note saved' })
      setOpen(false)
    })

  if (!phone || !telHref) {
    return <span className="text-xs text-ink-subtle">No phone</span>
  }

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-1">
          <a
            href={telHref}
            className="inline-flex size-8 items-center justify-center rounded-[var(--radius)] border border-line bg-white text-ink hover:border-[var(--brand-500)] hover:text-[var(--brand-700)]"
            title={`Call ${contactLabel ?? phone}`}
            aria-label={`Call ${studentName}`}
          >
            <Phone className="size-3.5" aria-hidden />
          </a>
          <Button size="sm" variant="ghost" onClick={openDialog}>
            Note
          </Button>
        </div>
        {lastCallAt ? (
          <p className="max-w-[11rem] truncate text-right text-[11px] text-ink-subtle" title={lastCallNotes ?? undefined}>
            Last: {formatDay(new Date(lastCallAt), 'd MMM')}
            {lastCallNotes ? ` · ${lastCallNotes}` : ''}
          </p>
        ) : null}
      </div>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Call note · ${studentName}`}
        footer={
          <>
            <Button loading={pending} onClick={save}>Save note</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <p className="text-ink-muted">
            Calling <strong className="text-ink">{contactLabel ?? phone}</strong>
            {' · '}
            <a className="font-medium text-[var(--brand-700)] hover:underline" href={telHref}>{phone}</a>
          </p>
          <Field label="When was the call?" htmlFor={`call-at-${studentId}`}>
            <Input
              id={`call-at-${studentId}`}
              type="datetime-local"
              value={calledAt}
              onChange={(e) => setCalledAt(e.target.value)}
            />
          </Field>
          <Field label="What was discussed?" htmlFor={`call-notes-${studentId}`}>
            <Textarea
              id={`call-notes-${studentId}`}
              rows={4}
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Promised to pay by Friday, asked for a copy of the fee receipt…"
            />
          </Field>
          {error ? <p className="text-danger">{error}</p> : null}
        </div>
      </Dialog>
    </>
  )
}
