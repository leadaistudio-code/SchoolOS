'use client'

import { useActionState } from 'react'
import { createEventAction, registerParticipantAction } from './actions'
import { emptyFormState } from '@/lib/form-state'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea, Select } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'

export function CreateEventForm() {
  const [state, action, pending] = useActionState(createEventAction, emptyFormState)
  return (
    <form action={action} className="space-y-3">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <Field label="Title" htmlFor="title" required>
        <Input id="title" name="title" required />
      </Field>
      <Field label="Category" htmlFor="category">
        <Input id="category" name="category" defaultValue="GENERAL" />
      </Field>
      <Field label="Venue" htmlFor="venue">
        <Input id="venue" name="venue" />
      </Field>
      <Field label="Starts" htmlFor="startsAt" required>
        <Input id="startsAt" name="startsAt" type="datetime-local" required />
      </Field>
      <Field label="Ends" htmlFor="endsAt" required>
        <Input id="endsAt" name="endsAt" type="datetime-local" required />
      </Field>
      <Field label="Max participants" htmlFor="maxParticipants">
        <Input id="maxParticipants" name="maxParticipants" type="number" min={1} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" name="registrationOpen" />
        Registration open
      </label>
      <Field label="Description" htmlFor="description">
        <Textarea id="description" name="description" rows={3} />
      </Field>
      <Button type="submit" loading={pending} block>
        Create event
      </Button>
    </form>
  )
}

export function RegisterForm({
  eventId,
  students,
}: {
  eventId: string
  students: { id: string; label: string }[]
}) {
  const bound = registerParticipantAction.bind(null, eventId)
  const [state, action, pending] = useActionState(bound, emptyFormState)
  return (
    <form action={action} className="space-y-3">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success">{state.message}</Notice> : null}
      <Field label="Student" htmlFor="studentId" required>
        <Select id="studentId" name="studentId" required defaultValue="">
          <option value="" disabled>
            Choose student
          </option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" loading={pending} size="sm">
        Register
      </Button>
    </form>
  )
}
