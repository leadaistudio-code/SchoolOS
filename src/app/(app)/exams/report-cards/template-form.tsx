'use client'

import { useActionState } from 'react'
import { Save } from 'lucide-react'
import {
  createReportCardTemplateAction,
  updateReportCardTemplateAction,
} from '../certificates/actions'
import { emptyFormState } from '@/lib/form-state'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, Input } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'

type TemplateValues = {
  id?: string
  name: string
  isDefault: boolean
  showAttendance: boolean
  showRank: boolean
  showRemarks: boolean
  headerHtml: string
  footerHtml: string
}

export function ReportCardTemplateForm({ initial }: { initial?: TemplateValues }) {
  const action = initial?.id ? updateReportCardTemplateAction : createReportCardTemplateAction
  const [state, formAction, pending] = useActionState(action, emptyFormState)

  return (
    <form action={formAction} className="space-y-4 max-w-2xl" noValidate>
      {initial?.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok && state.message ? <Notice tone="success">{state.message}</Notice> : null}

      <Field label="Template name" htmlFor="name" required error={state.fieldErrors.name}>
        <Input
          id="name"
          name="name"
          required
          maxLength={80}
          placeholder="Standard report card"
          defaultValue={initial?.name}
        />
      </Field>

      <div className="flex flex-wrap gap-4 text-sm text-ink">
        <label className="flex items-center gap-2">
          <Checkbox name="showRank" defaultChecked={initial?.showRank ?? true} />
          Show class rank
        </label>
        <label className="flex items-center gap-2">
          <Checkbox name="showRemarks" defaultChecked={initial?.showRemarks ?? true} />
          Show remarks column
        </label>
        <label className="flex items-center gap-2">
          <Checkbox name="showAttendance" defaultChecked={initial?.showAttendance ?? true} />
          Show attendance (when available)
        </label>
        <label className="flex items-center gap-2">
          <Checkbox name="isDefault" defaultChecked={initial?.isDefault ?? !initial} />
          Default template
        </label>
      </div>

      <Field label="Header HTML (optional)" htmlFor="headerHtml" className="sm:col-span-2">
        <textarea
          id="headerHtml"
          name="headerHtml"
          rows={3}
          className="w-full rounded-[var(--radius-sm)] border border-line bg-surface px-3 py-2.5 text-sm font-mono"
          placeholder="<p>School motto or crest HTML</p>"
          defaultValue={initial?.headerHtml}
        />
      </Field>

      <Field label="Footer HTML (optional)" htmlFor="footerHtml" className="sm:col-span-2">
        <textarea
          id="footerHtml"
          name="footerHtml"
          rows={3}
          className="w-full rounded-[var(--radius-sm)] border border-line bg-surface px-3 py-2.5 text-sm font-mono"
          placeholder="<p>Principal signature line</p>"
          defaultValue={initial?.footerHtml}
        />
      </Field>

      <Button type="submit" loading={pending}>
        {!pending ? <Save className="size-4" aria-hidden /> : null}
        {initial?.id ? 'Update template' : 'Save template'}
      </Button>
    </form>
  )
}
