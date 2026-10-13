'use client'

import { useActionState, useEffect, useRef } from 'react'
import { Ban } from 'lucide-react'
import { addUnsubscribeAction } from '../actions'
import { emptyFormState } from '@/lib/form-state'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'

export function AddUnsubscribeForm() {
  const [state, action, pending] = useActionState(addUnsubscribeAction, emptyFormState)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.ok) formRef.current?.reset()
  }, [state])

  return (
    <form ref={formRef} action={action} className="space-y-3">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success">{state.message}</Notice> : null}
      <Field label="Email" htmlFor="u-email" required hint="For a school that replied asking not to be contacted.">
        <Input id="u-email" name="email" type="email" required placeholder="principal@school.edu.in" />
      </Field>
      <Field label="Note" htmlFor="u-reason">
        <Input id="u-reason" name="reason" maxLength={300} placeholder="Replied: not interested" />
      </Field>
      <Button type="submit" loading={pending}>
        <Ban aria-hidden /> Never email this address
      </Button>
    </form>
  )
}
