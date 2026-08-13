'use client'

import { useActionState } from 'react'
import { addMemberAction, createSportAction, createTeamAction } from './actions'
import { emptyFormState } from '@/lib/form-state'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'

export function CreateSportForm() {
  const [state, action, pending] = useActionState(createSportAction, emptyFormState)
  return (
    <form action={action} className="space-y-3">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success">{state.message}</Notice> : null}
      <Field label="Sport" htmlFor="name" required>
        <Input id="name" name="name" required />
      </Field>
      <Field label="Category" htmlFor="category">
        <Input id="category" name="category" placeholder="e.g. Team / Individual" />
      </Field>
      <Button type="submit" loading={pending} size="sm">
        Add sport
      </Button>
    </form>
  )
}

export function CreateTeamForm({ sports }: { sports: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createTeamAction, emptyFormState)
  return (
    <form action={action} className="space-y-3">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success">{state.message}</Notice> : null}
      <Field label="Sport" htmlFor="sportId" required>
        <Select id="sportId" name="sportId" required defaultValue="">
          <option value="" disabled>
            Choose
          </option>
          {sports.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Team name" htmlFor="name" required>
        <Input id="name" name="name" required />
      </Field>
      <Field label="Age group" htmlFor="ageGroup">
        <Input id="ageGroup" name="ageGroup" placeholder="e.g. U-14" />
      </Field>
      <Button type="submit" loading={pending} size="sm">
        Add team
      </Button>
    </form>
  )
}

export function AddMemberForm({
  teams,
  students,
}: {
  teams: { id: string; label: string }[]
  students: { id: string; label: string }[]
}) {
  const [state, action, pending] = useActionState(addMemberAction, emptyFormState)
  return (
    <form action={action} className="space-y-3">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success">{state.message}</Notice> : null}
      <Field label="Team" htmlFor="teamId" required>
        <Select id="teamId" name="teamId" required defaultValue="">
          <option value="" disabled>
            Choose
          </option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Student" htmlFor="studentId" required>
        <Select id="studentId" name="studentId" required defaultValue="">
          <option value="" disabled>
            Choose
          </option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Position" htmlFor="position">
        <Input id="position" name="position" />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isCaptain" />
        Captain
      </label>
      <Button type="submit" loading={pending} size="sm">
        Add member
      </Button>
    </form>
  )
}
