'use client'

import { useActionState } from 'react'
import { Save } from 'lucide-react'
import { createCertificateTemplateAction } from './actions'
import { emptyFormState } from '@/lib/form-state'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, Input, Select } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { CERTIFICATE_TEMPLATE_KEYS } from '@/lib/certificates'

export function CertificateTemplateForm() {
  const [state, action, pending] = useActionState(createCertificateTemplateAction, emptyFormState)

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok && state.message ? <Notice tone="success">{state.message}</Notice> : null}

      <Field label="Template key" htmlFor="key" required error={state.fieldErrors.key}>
        <Select id="key" name="key" defaultValue="CUSTOM">
          {CERTIFICATE_TEMPLATE_KEYS.map((key) => (
            <option key={key} value={key}>
              {key.replace('_', ' ')}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Display name" htmlFor="name" required error={state.fieldErrors.name}>
        <Input id="name" name="name" required maxLength={80} placeholder="Sports achievement" />
      </Field>

      <Field
        label="Body HTML"
        htmlFor="bodyHtml"
        required
        error={state.fieldErrors.bodyHtml}
        hint="Use {{student_name}}, {{admission_no}}, {{class}}, {{school_name}}, {{session}}, {{date}}, {{purpose}}"
        className="sm:col-span-2"
      >
        <textarea
          id="bodyHtml"
          name="bodyHtml"
          required
          rows={10}
          className="w-full rounded-[var(--radius-sm)] border border-line bg-surface px-3 py-2.5 text-sm font-mono"
          defaultValue={`<p>This is to certify that <strong>{{student_name}}</strong> …</p>`}
        />
      </Field>

      <label className="flex items-center gap-2 text-sm text-ink">
        <Checkbox name="isActive" defaultChecked />
        Active
      </label>

      <Button type="submit" loading={pending}>
        {!pending ? <Save className="size-4" aria-hidden /> : null}
        Save template
      </Button>
    </form>
  )
}
