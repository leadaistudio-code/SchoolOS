'use client'

import { useActionState } from 'react'
import { publicEnquireAction } from './actions'
import { emptyFormState } from '@/lib/form-state'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'

export function EnquireForm() {
  const [state, action, pending] = useActionState(publicEnquireAction, emptyFormState)

  if (state.ok) {
    return <Notice tone="success">{state.message}</Notice>
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}

      <Field label="Child's name" htmlFor="studentName" required error={state.fieldErrors.studentName}>
        <Input id="studentName" name="studentName" required />
      </Field>
      <Field label="Parent / guardian name" htmlFor="parentName" required error={state.fieldErrors.parentName}>
        <Input id="parentName" name="parentName" required />
      </Field>
      <Field label="Phone" htmlFor="phone" required error={state.fieldErrors.phone}>
        <Input id="phone" name="phone" required inputMode="tel" />
      </Field>
      <Field label="Email" htmlFor="email" error={state.fieldErrors.email}>
        <Input id="email" name="email" type="email" />
      </Field>
      <Field label="Class of interest" htmlFor="interestedClass" error={state.fieldErrors.interestedClass}>
        <Input id="interestedClass" name="interestedClass" placeholder="e.g. Class 1" />
      </Field>
      <Field label="Message" htmlFor="notes" error={state.fieldErrors.notes}>
        <Textarea id="notes" name="notes" rows={3} />
      </Field>

      {/* Honeypot — leave empty */}
      <div className="absolute -left-[9999px]" aria-hidden>
        <label htmlFor="company">Company</label>
        <input id="company" name="company" tabIndex={-1} autoComplete="off" />
      </div>

      <Button type="submit" loading={pending} block>
        Submit enquiry
      </Button>
    </form>
  )
}
