'use client'

import { useActionState, useMemo } from 'react'
import { captureFieldLeadAction } from '../actions'
import { emptyFormState } from '@/lib/form-state'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import {
  CONTACT_ROLES,
  CONTACT_ROLE_LABELS,
  LEAD_SOURCES,
  LEAD_SOURCE_LABELS,
  STAGE_LABELS,
} from '@/lib/growth-crm'

function defaultFollowUpLocal(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(10, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function FieldCaptureForm() {
  const [state, action, pending] = useActionState(captureFieldLeadAction, emptyFormState)
  const followUpDefault = useMemo(() => defaultFollowUpLocal(), [])

  return (
    <form action={action} className="space-y-5" noValidate>
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">1. School</h2>
        <Field label="School name" htmlFor="name" required error={state.fieldErrors.name}>
          <Input id="name" name="name" required autoFocus autoComplete="organization" />
        </Field>
        <Field label="City" htmlFor="city" required error={state.fieldErrors.city}>
          <Input id="city" name="city" required autoComplete="address-level2" />
        </Field>
        <Field label="How you found them" htmlFor="leadSource">
          <Select id="leadSource" name="leadSource" defaultValue="SCHOOL_VISIT">
            {LEAD_SOURCES.map((source) => (
              <option key={source} value={source}>
                {LEAD_SOURCE_LABELS[source]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Pipeline stage" htmlFor="stage" hint="Usually Contacted after a visit">
          <Select id="stage" name="stage" defaultValue="CONTACTED">
            {(['PROSPECT', 'CONTACTED', 'MEETING_SCHEDULED', 'DEMO_COMPLETED', 'FOLLOW_UP'] as const).map(
              (stage) => (
                <option key={stage} value={stage}>
                  {STAGE_LABELS[stage]}
                </option>
              ),
            )}
          </Select>
        </Field>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">2. Who you met</h2>
        <Field label="Contact name" htmlFor="contactName" required error={state.fieldErrors.contactName}>
          <Input id="contactName" name="contactName" required autoComplete="name" />
        </Field>
        <Field label="Designation" htmlFor="contactDesignation">
          <Select id="contactDesignation" name="contactDesignation" defaultValue="PRINCIPAL">
            {CONTACT_ROLES.map((role) => (
              <option key={role} value={role}>
                {CONTACT_ROLE_LABELS[role]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Mobile" htmlFor="contactMobile" required error={state.fieldErrors.contactMobile}>
          <Input id="contactMobile" name="contactMobile" required inputMode="tel" autoComplete="tel" />
        </Field>
        <label className="flex min-h-11 items-center gap-2 text-sm text-ink-muted">
          <Checkbox name="isDecisionMaker" defaultChecked />
          Decision maker
        </label>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">3. Visit notes</h2>
        <Field
          label="What was discussed"
          htmlFor="visitSummary"
          required
          error={state.fieldErrors.visitSummary}
          hint="Pain points, interest, who else is involved"
        >
          <Textarea id="visitSummary" name="visitSummary" rows={4} required />
        </Field>
        <Field label="Current ERP" htmlFor="currentErp">
          <Input id="currentErp" name="currentErp" placeholder="e.g. EduSathi, Excel, none" />
        </Field>
        <Field label="Main objection" htmlFor="primaryObjection">
          <Input id="primaryObjection" name="primaryObjection" placeholder="Price, timing, competitor…" />
        </Field>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">4. Next step (required)</h2>
        <Field
          label="Follow up on"
          htmlFor="nextFollowUpAt"
          required
          error={state.fieldErrors.nextFollowUpAt}
        >
          <Input
            id="nextFollowUpAt"
            name="nextFollowUpAt"
            type="datetime-local"
            required
            defaultValue={followUpDefault}
          />
        </Field>
        <Field
          label="Next action"
          htmlFor="nextAction"
          required
          error={state.fieldErrors.nextAction}
          hint="One clear action — call, send proposal, book demo"
        >
          <Input
            id="nextAction"
            name="nextAction"
            required
            placeholder="Call principal to book demo"
            defaultValue="Follow-up call"
          />
        </Field>
      </section>

      <label className="flex min-h-11 items-center gap-2 text-sm text-ink-muted">
        <Checkbox name="confirmDuplicate" />
        Create anyway if a similar school already exists
      </label>

      <div className="sticky bottom-0 -mx-1 border-t border-line bg-bg/95 px-1 py-3 backdrop-blur">
        <Button type="submit" loading={pending} block size="lg">
          Save to CRM funnel
        </Button>
        <p className="mt-2 text-center text-xs text-ink-subtle">
          Saves school + contact + visit + follow-up in one go.
        </p>
      </div>
    </form>
  )
}
