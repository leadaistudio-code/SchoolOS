'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Field, Textarea } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { callApi, FormDialog, useSubmit } from './payables-forms'

const ACTION_COPY = {
  approve: { hint: 'Signs this stage and passes the entry to the next one. Each stage needs a different person.', remarks: 'optional' },
  return: { hint: 'Sends the entry back to the person who made it. It stays out of the books until it is resubmitted and approved again.', remarks: 'required' },
  resubmit: { hint: 'Sends the entry back to the Checker. Earlier sign-offs are cleared and every stage signs again.', remarks: 'optional' },
} as const

const FINAL_HINT = 'Owner approval is the last step. The entry then counts in Profit & loss and the Balance sheet.'

export type JournalActionKind = keyof typeof ACTION_COPY

/** One approval button for a journal entry: confirms with remarks and sends the status the user saw. */
export function JournalActionButton({
  entryId,
  action,
  label,
  expectedStatus,
  finalStage,
  variant = 'secondary',
}: {
  entryId: string
  action: JournalActionKind
  label: string
  expectedStatus: string
  finalStage?: boolean
  variant?: 'ghost' | 'secondary' | 'danger' | 'primary'
}) {
  return (
    <FormDialog title={label} size="sm" trigger={(open) => <Button size="sm" variant={variant} onClick={open}>{label}</Button>}>
      {(close) => <ActionForm entryId={entryId} action={action} label={label} expectedStatus={expectedStatus} finalStage={finalStage} onDone={close} />}
    </FormDialog>
  )
}

function ActionForm({
  entryId,
  action,
  label,
  expectedStatus,
  finalStage,
  onDone,
}: {
  entryId: string
  action: JournalActionKind
  label: string
  expectedStatus: string
  finalStage?: boolean
  onDone: () => void
}) {
  const { busy, error, run } = useSubmit(onDone)
  const copy = ACTION_COPY[action]
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const remarks = String(new FormData(e.currentTarget).get('remarks') ?? '').trim()
    void run(() => callApi(`/api/v1/accounting/journal-approvals/${entryId}`, {
      method: 'POST',
      body: { action, expectedStatus, remarks: remarks || undefined },
    }))
  }
  const required = copy.remarks === 'required'
  return (
    <form onSubmit={submit} className="space-y-3">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <p className="text-sm text-ink-muted">{finalStage && action === 'approve' ? FINAL_HINT : copy.hint}</p>
      <Field label="Remarks" required={required} htmlFor="ja-remarks">
        <Textarea id="ja-remarks" name="remarks" rows={3} maxLength={500} required={required} minLength={required ? 3 : undefined} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>Back</Button>
        <Button type="submit" disabled={busy} variant="primary">{busy ? 'Working…' : label}</Button>
      </div>
    </form>
  )
}

/** Switches the optional Department head stage on or off for the school. */
export function DepartmentStageToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const toggle = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    const result = await callApi('/api/v1/accounting/journal-approvals/settings', { method: 'POST', body: { departmentStage: !enabled } })
    setBusy(false)
    if (!result.ok) setError(result.message)
    else router.refresh()
  }
  return (
    <div className="space-y-2">
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => void toggle()}>
        {busy ? 'Saving…' : enabled ? 'Remove the Department head stage' : 'Add a Department head stage'}
      </Button>
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </div>
  )
}
