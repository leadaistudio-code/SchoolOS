'use client'

import * as React from 'react'
import { useActionState } from 'react'
import Link from 'next/link'
import { AlertCircle, Save } from 'lucide-react'
import { createRevisionPlanAction, updateRevisionPlanAction } from './actions'
import { emptyFormState } from '@/lib/form-state'
import { toDateInput } from '@/lib/dates'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card, CardContent } from '@/components/ui/card'
import { Field, Input, Select, Textarea } from '@/components/ui/input'

type ClassOption = { id: string; name: string }

type PlanDraft = {
  id: string
  name: string
  classLevelId: string | null
  startsOn: string
  endsOn: string
  notes: string | null
}

export function RevisionPlanForm({
  classes,
  initial,
  mode,
}: {
  classes: ClassOption[]
  initial?: PlanDraft
  mode: 'create' | 'edit'
}) {
  const boundUpdate = initial
    ? updateRevisionPlanAction.bind(null, initial.id)
  : null
  const [state, formAction, pending] = useActionState(
    mode === 'edit' && boundUpdate ? boundUpdate : createRevisionPlanAction,
    emptyFormState,
  )
  const err = (f: string) => state.fieldErrors[f]

  return (
    <form action={formAction} noValidate>
      <Card>
        <CardContent className="pt-5 space-y-4">
          {state.error ? (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-[var(--radius)] bg-danger-bg border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] px-3.5 py-2.5"
            >
              <AlertCircle className="size-4.5 text-[var(--danger)] mt-0.5 shrink-0" aria-hidden />
              <p className="text-sm text-[var(--danger)]">{state.error}</p>
            </div>
          ) : null}

          <Field label="Plan name" htmlFor="name" required error={err('name')}>
            <Input
              id="name"
              name="name"
              required
              maxLength={160}
              defaultValue={initial?.name}
              placeholder="e.g. Class 10 board exam revision"
            />
          </Field>

          <Field
            label="Class (optional)"
            htmlFor="classLevelId"
            hint="Leave as whole school, or scope the plan to one class"
            error={err('classLevelId')}
          >
            <Select id="classLevelId" name="classLevelId" defaultValue={initial?.classLevelId ?? ''}>
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Starts on" htmlFor="startsOn" required error={err('startsOn')}>
              <Input
                id="startsOn"
                name="startsOn"
                type="date"
                required
                defaultValue={initial?.startsOn ?? toDateInput(new Date())}
              />
            </Field>
            <Field label="Ends on" htmlFor="endsOn" required error={err('endsOn')}>
              <Input
                id="endsOn"
                name="endsOn"
                type="date"
                required
                defaultValue={initial?.endsOn ?? toDateInput(new Date())}
              />
            </Field>
          </div>

          <Field label="Notes" htmlFor="notes" hint="Optional — shown on the plan detail" error={err('notes')}>
            <Textarea id="notes" name="notes" rows={3} defaultValue={initial?.notes ?? ''} placeholder="Instructions for teachers or students" />
          </Field>

          <div className="flex items-center gap-2 pt-1">
            <Button type="submit" loading={pending}>
              <Save aria-hidden />
              {mode === 'edit' ? 'Save changes' : 'Create plan'}
            </Button>
            <Link
              href={initial ? `/academics/revision/${initial.id}` : '/academics/revision'}
              className={buttonVariants({ variant: 'ghost' })}
            >
              Cancel
            </Link>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}