'use client'

import { useState, useTransition } from 'react'
import { Ban, Lock, LockOpen, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { closeMarksSheetAction, transitionMarksSheetAction } from '../actions'

type Status = 'OPEN' | 'SUBMITTED' | 'LOCKED'

/** Submit / lock / reopen / close-without-marks controls for one marks sheet. */
export function SheetActions({
  sheetId,
  status,
  isAdmin,
  published,
  canClose = false,
}: {
  sheetId: string
  status: Status
  isAdmin: boolean
  published: boolean
  /** Admin may close the paper without (complete) marks. */
  canClose?: boolean
}) {
  const [pending, start] = useTransition()
  const toast = useToast()
  const run = (to: Status, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return
    start(async () => {
      const result = await transitionMarksSheetAction(sheetId, to)
      toast.push({ tone: result.ok ? 'success' : 'error', title: result.message })
    })
  }
  const [closing, setClosing] = useState(false)
  const [reason, setReason] = useState('')
  const close = () =>
    start(async () => {
      const result = await closeMarksSheetAction(sheetId, reason.trim())
      toast.push({ tone: result.ok ? 'success' : 'error', title: result.message })
      if (result.ok) setClosing(false)
    })
  const btn = 'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50'

  if (published && !isAdmin) return <span className="text-xs text-ink-subtle">Published</span>
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {published ? <span className="mr-1 text-xs text-ink-subtle">Published</span> : null}
      {status === 'OPEN' && !published ? (
        <button type="button" disabled={pending} onClick={() => run('SUBMITTED', 'Submit this marks sheet? Teachers cannot edit it afterwards.')} className={`${btn} border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100`}>
          <Send className="size-3" aria-hidden /> Submit
        </button>
      ) : null}
      {isAdmin && status !== 'LOCKED' ? (
        <button type="button" disabled={pending} onClick={() => run('LOCKED', 'Lock this marks sheet? Nobody can edit marks until it is reopened.')} className={`${btn} border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100`}>
          <Lock className="size-3" aria-hidden /> Lock
        </button>
      ) : null}
      {isAdmin && canClose && !published ? (
        <button type="button" disabled={pending} onClick={() => setClosing(true)} title="Close this paper without entering marks and leave it out of results" className={`${btn} border-line bg-surface-2 text-ink-muted hover:text-ink`}>
          <Ban className="size-3" aria-hidden /> Close without marks
        </button>
      ) : null}
      <Dialog
        open={closing}
        onClose={() => setClosing(false)}
        title="Close this paper without marks?"
        description="The paper is locked, stops counting as pending, and is left out of results and report cards. Marks already entered are kept, and Reopen undoes this."
        footer={
          <>
            <Button loading={pending} onClick={close}>Close paper</Button>
            <Button variant="ghost" onClick={() => setClosing(false)}>Cancel</Button>
          </>
        }
      >
        <Field label="Reason (optional)" htmlFor={`close-${sheetId}`}>
          <Input id={`close-${sheetId}`} value={reason} maxLength={200} placeholder="e.g. Not conducted" onChange={(event) => setReason(event.target.value)} />
        </Field>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {['Not conducted', 'No subject teacher', 'Not evaluated this term'].map((preset) => (
            <button key={preset} type="button" onClick={() => setReason(preset)} className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-muted hover:bg-surface-2 hover:text-ink">
              {preset}
            </button>
          ))}
        </div>
      </Dialog>
      {isAdmin && status !== 'OPEN' ? (
        <button type="button" disabled={pending} onClick={() => run('OPEN', published ? 'Reopen this paper? Results for this exam are already published.\n\nThe paper will count towards results again and marks can be entered. After entering marks, lock the sheet and use Recalculate results in Marks management so the published report cards update.' : undefined)} className={`${btn} border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100`}>
          <LockOpen className="size-3" aria-hidden /> Reopen
        </button>
      ) : null}
    </div>
  )
}
