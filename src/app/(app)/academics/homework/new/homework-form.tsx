'use client'

import * as React from 'react'
import { useActionState } from 'react'
import Link from 'next/link'
import { AlertCircle, Save } from 'lucide-react'
import { createHomeworkAction } from '../actions'
import { emptyFormState } from '@/lib/form-state'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card, CardContent } from '@/components/ui/card'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { toDateInput } from '@/lib/dates'

type SubjectOption = {
  id: string
  label: string
  sections: { id: string; name: string }[]
}

export function HomeworkForm({ subjects }: { subjects: SubjectOption[] }) {
  const [state, formAction, pending] = useActionState(createHomeworkAction, emptyFormState)
  const [subjectId, setSubjectId] = React.useState(subjects[0]?.id ?? '')

  const today = toDateInput(new Date())
  const [assignedOn, setAssignedOn] = React.useState(today)
  const sections = subjects.find((s) => s.id === subjectId)?.sections ?? []
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

          <Field
            label="Class and subject"
            htmlFor="classSubjectId"
            required
            error={err('classSubjectId')}
          >
            <Select
              id="classSubjectId"
              name="classSubjectId"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              required
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Section"
            htmlFor="sectionId"
            hint="Leave as whole class to set it for every section"
            error={err('sectionId')}
          >
            <Select id="sectionId" name="sectionId" defaultValue="">
              <option value="">Whole class</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  Section {s.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Title" htmlFor="title" required error={err('title')}>
            <Input
              id="title"
              name="title"
              required
              placeholder="e.g. Chapter 4 exercises"
              maxLength={160}
            />
          </Field>

          <Field label="Instructions" htmlFor="instructions" error={err('instructions')}>
            <Textarea
              id="instructions"
              name="instructions"
              rows={5}
              placeholder="What the students need to do"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Assigned on" htmlFor="assignedOn" required error={err('assignedOn')}>
              <Input
                id="assignedOn"
                name="assignedOn"
                type="date"
                required
                value={assignedOn}
                onChange={(e) => setAssignedOn(e.target.value)}
              />
            </Field>
            <Field label="Due on" htmlFor="dueOn" required error={err('dueOn')}>
              <Input
                id="dueOn"
                name="dueOn"
                type="date"
                required
                min={assignedOn}
                defaultValue={today}
              />
            </Field>
            <Field label="Out of" htmlFor="maxScore" hint="Optional" error={err('maxScore')}>
              <Input id="maxScore" name="maxScore" type="number" min={0} placeholder="20" />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              name="isPublished"
              defaultChecked
              className="size-4 rounded-[3px] border border-line-strong accent-[var(--brand-500)]"
            />
            Publish now and notify the class
          </label>

          <div className="flex items-center gap-2 pt-1">
            <Button type="submit" loading={pending}>
              <Save aria-hidden />
              Set homework
            </Button>
            <Link href="/academics/homework" className={buttonVariants({ variant: 'ghost' })}>
              Cancel
            </Link>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
