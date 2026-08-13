'use client'

import { useActionState } from 'react'
import { createLeadAction } from './actions'
import { emptyFormState } from '@/lib/form-state'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { LEAD_SOURCES } from '@/lib/admissions'

export function CreateLeadForm({
  classes,
  staff,
}: {
  classes: { id: string; name: string }[]
  staff: { userId: string | null; firstName: string; lastName: string }[]
}) {
  const [state, action, pending] = useActionState(createLeadAction, emptyFormState)
  const assignees = staff.filter((s): s is typeof s & { userId: string } => !!s.userId)

  return (
    <form action={action} className="space-y-3" noValidate>
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}

      <Field label="Student name" htmlFor="studentName" required error={state.fieldErrors.studentName}>
        <Input id="studentName" name="studentName" required />
      </Field>
      <Field label="Parent / guardian" htmlFor="parentName" required error={state.fieldErrors.parentName}>
        <Input id="parentName" name="parentName" required />
      </Field>
      <Field label="Phone" htmlFor="phone" required error={state.fieldErrors.phone}>
        <Input id="phone" name="phone" required inputMode="tel" />
      </Field>
      <Field label="Email" htmlFor="email" error={state.fieldErrors.email}>
        <Input id="email" name="email" type="email" />
      </Field>
      <Field label="Source" htmlFor="source" error={state.fieldErrors.source}>
        <Select id="source" name="source" defaultValue="WALK_IN">
          {LEAD_SOURCES.map((source) => (
            <option key={source} value={source}>
              {source.replaceAll('_', ' ')}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Interested class" htmlFor="interestedClassId" error={state.fieldErrors.interestedClassId}>
        <Select id="interestedClassId" name="interestedClassId" defaultValue="">
          <option value="">Not sure yet</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Assign to" htmlFor="assignedToId" error={state.fieldErrors.assignedToId}>
        <Select id="assignedToId" name="assignedToId" defaultValue="">
          <option value="">Unassigned</option>
          {assignees.map((s) => (
            <option key={s.userId} value={s.userId}>
              {s.firstName} {s.lastName}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Notes" htmlFor="notes" error={state.fieldErrors.notes}>
        <Textarea id="notes" name="notes" rows={3} />
      </Field>

      <Button type="submit" loading={pending} block>
        Capture enquiry
      </Button>
    </form>
  )
}
