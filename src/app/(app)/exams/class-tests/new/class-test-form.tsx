'use client'

import * as React from 'react'
import { useActionState } from 'react'
import Link from 'next/link'
import { AlertCircle, Save } from 'lucide-react'
import { createClassTestAction } from '../actions'
import { emptyFormState } from '@/lib/form-state'
import { toDateInput } from '@/lib/dates'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card, CardContent } from '@/components/ui/card'
import { Field, Input, Select, Textarea } from '@/components/ui/input'

type SubjectOption = { id: string; label: string; sections: { id: string; name: string }[] }

export function ClassTestForm({ subjects }: { subjects: SubjectOption[] }) {
  const [state, formAction, pending] = useActionState(createClassTestAction, emptyFormState)
  const [subjectId, setSubjectId] = React.useState(subjects[0]?.id ?? '')
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

          <Field label="Class and subject" htmlFor="classSubjectId" required error={err('classSubjectId')}>
            <Select id="classSubjectId" name="classSubjectId" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </Select>
          </Field>

          <Field label="Section" htmlFor="sectionId" hint="Leave as whole class to include every section" error={err('sectionId')}>
            <Select id="sectionId" name="sectionId" defaultValue="" key={subjectId}>
              <option value="">Whole class</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>Section {s.name}</option>
              ))}
            </Select>
          </Field>

          <Field label="Test name" htmlFor="title" required error={err('title')}>
            <Input id="title" name="title" required maxLength={160} placeholder="e.g. Chapter 3 quick test" />
          </Field>

          <Field label="Topics covered" htmlFor="syllabus" hint="Optional" error={err('syllabus')}>
            <Textarea id="syllabus" name="syllabus" rows={3} placeholder="What the test covers" />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Test date" htmlFor="heldOn" required error={err('heldOn')}>
              <Input id="heldOn" name="heldOn" type="date" required defaultValue={toDateInput(new Date())} />
            </Field>
            <Field label="Out of" htmlFor="maxMarks" hint="Optional. Leave blank to only tick completion" error={err('maxMarks')}>
              <Input id="maxMarks" name="maxMarks" type="number" min={1} placeholder="20" />
            </Field>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button type="submit" loading={pending}>
              <Save aria-hidden />
              Create class test
            </Button>
            <Link href="/exams/class-tests" className={buttonVariants({ variant: 'ghost' })}>
              Cancel
            </Link>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
