'use client'

import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteRecipientAction, saveRecipientAction, sendTestReminderAction, toggleRecipientAction } from './actions'
import { emptyFormState, type FormState } from '@/lib/form-state'
import type { ReminderSlot } from '@/lib/growth-reminders'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, Input, Select } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'

export type RecipientRow = {
  id: string
  name: string
  whatsapp: string | null
  email: string | null
  userId: string | null
  scope: string
  morning: boolean
  evening: boolean
  meetings: boolean
}

export type OperatorOption = { id: string; label: string }

export function RecipientForm({
  recipient,
  operators,
  onDone,
}: {
  recipient?: RecipientRow
  operators: OperatorOption[]
  onDone?: () => void
}) {
  const [state, action, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const next = await saveRecipientAction(prev, formData)
    if (next.ok && onDone) onDone()
    return next
  }, emptyFormState)
  const id = recipient?.id ?? 'new'

  return (
    <form action={action} className="space-y-3">
      {recipient ? <input type="hidden" name="id" value={recipient.id} /> : null}
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok && !recipient ? <Notice tone="success">{state.message}</Notice> : null}
      <Field label="Name" htmlFor={`name-${id}`} error={state.fieldErrors.name} required>
        <Input id={`name-${id}`} name="name" defaultValue={recipient?.name} required />
      </Field>
      <Field
        label="WhatsApp number"
        htmlFor={`wa-${id}`}
        error={state.fieldErrors.whatsapp}
        hint="The number that receives the 08:30 plan and 6 PM wrap-up"
      >
        <Input id={`wa-${id}`} name="whatsapp" inputMode="tel" defaultValue={recipient?.whatsapp ?? ''} />
      </Field>
      <Field label="Email (optional)" htmlFor={`email-${id}`} error={state.fieldErrors.email}>
        <Input id={`email-${id}`} name="email" type="email" defaultValue={recipient?.email ?? ''} />
      </Field>
      <Field label="CRM login" htmlFor={`user-${id}`} hint="Needed only for “Only their follow-ups”">
        <Select id={`user-${id}`} name="userId" defaultValue={recipient?.userId ?? ''}>
          <option value="">Not linked</option>
          {operators.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="What they see" htmlFor={`scope-${id}`}>
        <Select id={`scope-${id}`} name="scope" defaultValue={recipient?.scope ?? 'TEAM'}>
          <option value="TEAM">Whole team’s follow-ups</option>
          <option value="MINE">Only their follow-ups</option>
        </Select>
      </Field>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink">Send</legend>
        <Toggle name="morning" label="Morning plan, 08:30 AM" defaultChecked={recipient?.morning ?? true} />
        <Toggle name="evening" label="Evening wrap-up, 6:00 PM" defaultChecked={recipient?.evening ?? true} />
        <Toggle name="meetings" label="30 minutes before each meeting" defaultChecked={recipient?.meetings ?? true} />
      </fieldset>
      <Button type="submit" loading={pending} size="sm">
        {recipient ? 'Save' : 'Add salesperson'}
      </Button>
    </form>
  )
}

function Toggle({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm text-ink">
      <Checkbox name={name} defaultChecked={defaultChecked} />
      {label}
    </label>
  )
}

export function RecipientActions({
  recipient,
  isActive,
  operators,
}: {
  recipient: RecipientRow
  isActive: boolean
  operators: OperatorOption[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn()
      router.refresh()
    })

  const test = (slot: ReminderSlot) =>
    startTransition(async () => {
      setResult(await sendTestReminderAction(recipient.id, slot))
    })

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" loading={pending} onClick={() => test('morning')}>
          Send test: morning
        </Button>
        <Button size="sm" variant="secondary" loading={pending} onClick={() => test('evening')}>
          Send test: wrap-up
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>
          {editing ? 'Close' : 'Edit'}
        </Button>
        <Button size="sm" variant="ghost" loading={pending} onClick={() => run(() => toggleRecipientAction(recipient.id, !isActive))}>
          {isActive ? 'Pause' : 'Resume'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          loading={pending}
          onClick={() => {
            if (confirm(`Stop all reminders for ${recipient.name} and remove them?`)) {
              run(() => deleteRecipientAction(recipient.id))
            }
          }}
        >
          Remove
        </Button>
      </div>
      {result ? <Notice tone={result.ok ? 'success' : 'danger'}>{result.message}</Notice> : null}
      {editing ? (
        <div className="rounded-[var(--radius-sm)] border border-line p-3">
          <RecipientForm
            recipient={recipient}
            operators={operators}
            onDone={() => {
              setEditing(false)
              router.refresh()
            }}
          />
        </div>
      ) : null}
    </div>
  )
}
