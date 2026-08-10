'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Save } from 'lucide-react'
import { createExamAction } from './actions'
import { emptyFormState } from '@/lib/form-state'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Checkbox, Field, FormSection, Input, Select } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'

type ClassOption = {
  id: string
  name: string
  subjects: { id: string; subject: { name: string; code: string } }[]
}
type ScaleOption = { id: string; name: string; isDefault: boolean }

export function ExamForm({ classes, scales }: { classes: ClassOption[]; scales: ScaleOption[] }) {
  const [state, action, pending] = useActionState(createExamAction, emptyFormState)

  return (
    <form action={action} noValidate className="space-y-6 max-w-4xl">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}

      <FormSection title="Examination" description="What is being scheduled, and when.">
        <Field label="Exam name" htmlFor="name" required error={state.fieldErrors.name}>
          <Input id="name" name="name" required maxLength={100} placeholder="Term 1 Examination" />
        </Field>
        <Field label="Exam type" htmlFor="kind" required>
          <Select id="kind" name="kind" defaultValue="UNIT_TEST">
            <option value="WEEKLY">Weekly assessment</option>
            <option value="MONTHLY">Monthly assessment</option>
            <option value="UNIT_TEST">Unit test</option>
            <option value="MID_TERM">Mid-term</option>
            <option value="FINAL">Final</option>
            <option value="PRACTICAL">Practical</option>
            <option value="CUSTOM">Custom</option>
          </Select>
        </Field>
        <Field label="Starts on" htmlFor="startsOn">
          <Input id="startsOn" name="startsOn" type="date" />
        </Field>
        <Field label="Ends on" htmlFor="endsOn" error={state.fieldErrors.endsOn}>
          <Input id="endsOn" name="endsOn" type="date" />
        </Field>
        <Field
          label="Grading scale"
          htmlFor="gradingScaleId"
          hint="Required before results can be computed"
          className="sm:col-span-2"
        >
          <Select
            id="gradingScaleId"
            name="gradingScaleId"
            defaultValue={scales.find((scale) => scale.isDefault)?.id ?? ''}
          >
            <option value="">Choose later</option>
            {scales.map((scale) => (
              <option key={scale.id} value={scale.id}>
                {scale.name}
                {scale.isDefault ? ' (default)' : ''}
              </option>
            ))}
          </Select>
        </Field>
      </FormSection>

      <FormSection title="Classes" description="Which classes sit this examination.">
        <fieldset className="sm:col-span-2">
          <legend className="sr-only">Classes taking this examination</legend>
          <div className="grid gap-1.5 sm:grid-cols-3">
            {classes.map((item) => (
              <label
                key={item.id}
                className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-line px-2.5 py-2 text-sm text-ink hover:bg-surface-2"
              >
                <Checkbox name="classLevelIds" value={item.id} />
                {item.name}
              </label>
            ))}
          </div>
          {state.fieldErrors.classLevelIds ? (
            <p className="mt-1 text-xs text-[var(--danger)]" role="alert">
              {state.fieldErrors.classLevelIds}
            </p>
          ) : null}
        </fieldset>
      </FormSection>

      <FormSection
        title="Papers"
        description="Subjects to include. Each must belong to a selected class."
      >
        <fieldset className="sm:col-span-2 space-y-3">
          <legend className="sr-only">Subjects included in this examination</legend>
          {classes.map((item) => (
            <div key={item.id}>
              <p className="caption mb-1">{item.name}</p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {item.subjects.map((itemSubject) => (
                  <label
                    key={itemSubject.id}
                    className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-line px-2.5 py-2 text-sm text-ink hover:bg-surface-2"
                  >
                    <Checkbox name="classSubjectIds" value={itemSubject.id} />
                    {itemSubject.subject.name}
                    <span className="text-ink-subtle">{itemSubject.subject.code}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          {state.fieldErrors.classSubjectIds ? (
            <p className="mt-1 text-xs text-[var(--danger)]" role="alert">
              {state.fieldErrors.classSubjectIds}
            </p>
          ) : null}
        </fieldset>
      </FormSection>

      <div className="flex items-center gap-2 border-t border-line pt-4">
        <Button type="submit" loading={pending}>
          <Save aria-hidden />
          Create exam
        </Button>
        <Link href="/exams" className={buttonVariants({ variant: 'ghost' })}>
          Cancel
        </Link>
      </div>
    </form>
  )
}
