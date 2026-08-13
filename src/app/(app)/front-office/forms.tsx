'use client'

import { useActionState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  checkInAction,
  checkOutAction,
  createAppointmentAction,
  setAppointmentStatusAction,
  visitorToLeadAction,
} from './actions'
import { emptyFormState } from '@/lib/form-state'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'

export function CheckInForm() {
  const [state, action, pending] = useActionState(checkInAction, emptyFormState)
  return (
    <form action={action} className="space-y-3">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success">{state.message}</Notice> : null}
      <Field label="Visitor name" htmlFor="name" required>
        <Input id="name" name="name" required />
      </Field>
      <Field label="Phone" htmlFor="phone">
        <Input id="phone" name="phone" />
      </Field>
      <Field label="Purpose" htmlFor="purpose" required>
        <Input id="purpose" name="purpose" required />
      </Field>
      <Field label="To meet" htmlFor="toMeet">
        <Input id="toMeet" name="toMeet" />
      </Field>
      <Field label="ID proof no." htmlFor="idProofNo">
        <Input id="idProofNo" name="idProofNo" />
      </Field>
      <Field label="Persons" htmlFor="personCount">
        <Input id="personCount" name="personCount" type="number" min={1} defaultValue={1} />
      </Field>
      <Button type="submit" loading={pending} block>
        Check in
      </Button>
    </form>
  )
}

export function AppointmentForm() {
  const [state, action, pending] = useActionState(createAppointmentAction, emptyFormState)
  return (
    <form action={action} className="space-y-3">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success">{state.message}</Notice> : null}
      <Field label="Title" htmlFor="title" required>
        <Input id="title" name="title" required />
      </Field>
      <Field label="Visitor name" htmlFor="visitorName" required>
        <Input id="visitorName" name="visitorName" required />
      </Field>
      <Field label="Phone" htmlFor="phone">
        <Input id="phone" name="phone" />
      </Field>
      <Field label="When" htmlFor="scheduledAt" required>
        <Input id="scheduledAt" name="scheduledAt" type="datetime-local" required />
      </Field>
      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={2} />
      </Field>
      <Button type="submit" loading={pending} block>
        Schedule
      </Button>
    </form>
  )
}

export function VisitorRowActions({
  id,
  checkedOut,
  hasPhone,
  canManage,
  canAdmissions,
}: {
  id: string
  checkedOut: boolean
  hasPhone: boolean
  canManage: boolean
  canAdmissions: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  if (!canManage) return null

  return (
    <div className="flex flex-wrap gap-2">
      {!checkedOut ? (
        <Button
          size="sm"
          variant="secondary"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              await checkOutAction(id)
              router.refresh()
            })
          }
        >
          Check out
        </Button>
      ) : null}
      {canAdmissions && hasPhone ? (
        <Button
          size="sm"
          variant="subtle"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              await visitorToLeadAction(id)
            })
          }
        >
          To admissions
        </Button>
      ) : null}
    </div>
  )
}

export function AppointmentStatusButtons({ id }: { id: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <div className="flex flex-wrap gap-1">
      {(['DONE', 'CANCELLED', 'NO_SHOW'] as const).map((status) => (
        <Button
          key={status}
          size="sm"
          variant="ghost"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              await setAppointmentStatusAction(id, status)
              router.refresh()
            })
          }
        >
          {status.replaceAll('_', ' ')}
        </Button>
      ))}
    </div>
  )
}
