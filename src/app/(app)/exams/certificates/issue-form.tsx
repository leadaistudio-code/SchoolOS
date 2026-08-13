'use client'

import { useActionState } from 'react'
import { Award } from 'lucide-react'
import { issueCertificateAction } from './actions'
import { emptyFormState } from '@/lib/form-state'
import { Button } from '@/components/ui/button'
import { Field, Select } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'

export function IssueCertificateForm({
  templates,
  students,
}: {
  templates: { id: string; name: string; key: string }[]
  students: { id: string; label: string }[]
}) {
  const [state, action, pending] = useActionState(issueCertificateAction, emptyFormState)

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}

      <Field label="Certificate type" htmlFor="templateId" required error={state.fieldErrors.templateId}>
        <Select id="templateId" name="templateId" required defaultValue="">
          <option value="" disabled>
            Choose a template
          </option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Student" htmlFor="studentId" required error={state.fieldErrors.studentId}>
        <Select id="studentId" name="studentId" required defaultValue="">
          <option value="" disabled>
            Choose a student
          </option>
          {students.map((student) => (
            <option key={student.id} value={student.id}>
              {student.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Purpose (optional)" htmlFor="purpose" error={state.fieldErrors.purpose}>
        <textarea
          id="purpose"
          name="purpose"
          rows={2}
          maxLength={300}
          className="w-full rounded-[var(--radius-sm)] border border-line bg-surface px-3 py-2.5 text-sm"
          placeholder="Passport application, bank account, etc."
        />
      </Field>

      <Button type="submit" loading={pending}>
        {!pending ? <Award className="size-4" aria-hidden /> : null}
        Issue certificate
      </Button>
    </form>
  )
}
