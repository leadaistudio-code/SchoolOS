'use client'

import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from 'react'
import { captureFieldLeadAction } from '../actions'
import { PhotoPicker } from '../photo-picker'
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

const pad = (n: number) => String(n).padStart(2, '0')
/** Pinned to IST so the server render and the phone agree on "today", even just after midnight. */
const dateInput = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

function inDays(days: number, hour = 10): string {
  return `${dateInput(new Date(Date.now() + days * 86_400_000))}T${pad(hour)}:00`
}

const FOLLOW_UP_PRESETS = [
  { label: 'Tomorrow', days: 1 },
  { label: 'In 3 days', days: 3 },
  { label: 'Next week', days: 7 },
  { label: 'In 2 weeks', days: 14 },
]

const NEXT_ACTIONS = ['Follow-up call', 'Send brochure', 'Send proposal', 'Book demo', 'Meet management']

/** Date and time inputs are in the phone's local time; the server needs an exact instant. */
function toIso(local: string): string {
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? local : d.toISOString()
}

function visitIso(day: string): string {
  if (!day) return new Date().toISOString()
  if (day === dateInput(new Date())) return new Date().toISOString()
  return toIso(`${day}T12:00`)
}

export function FieldCaptureForm() {
  const [state, action, pending] = useActionState(captureFieldLeadAction, emptyFormState)
  const today = useMemo(() => dateInput(new Date()), [])
  const [followUp, setFollowUp] = useState(() => inDays(1))
  const [nextAction, setNextAction] = useState('Follow-up call')
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.error) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [state])

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set('visitedAt', visitIso(String(fd.get('visitDay') ?? '')))
    fd.set('nextFollowUpAt', toIso(followUp))
    fd.delete('visitDay')
    startTransition(() => action(fd))
  }

  const err = state.fieldErrors

  return (
    <form ref={formRef} onSubmit={onSubmit} className="scroll-mt-20 space-y-6" noValidate>
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">1. School</h2>
        <Field label="School name" htmlFor="name" required error={err.name}>
          <Input id="name" name="name" required autoComplete="organization" enterKeyHint="next" />
        </Field>
        <Field label="Area / city" htmlFor="city" required error={err.city}>
          <Input id="city" name="city" required autoComplete="address-level2" placeholder="e.g. Saket, New Delhi" enterKeyHint="next" />
        </Field>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">2. Who you spoke with</h2>
        <Field label="Name" htmlFor="contactName" required error={err.contactName}>
          <Input id="contactName" name="contactName" required autoComplete="name" enterKeyHint="next" />
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
        <Field label="Contact number" htmlFor="contactMobile" required error={err.contactMobile}>
          <Input
            id="contactMobile"
            name="contactMobile"
            type="tel"
            required
            inputMode="tel"
            autoComplete="tel"
            placeholder="98xxxxxxxx"
            enterKeyHint="next"
          />
        </Field>
        <Field label="Email address" htmlFor="contactEmail" error={err.contactEmail}>
          <Input
            id="contactEmail"
            name="contactEmail"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            placeholder="principal@school.in"
            enterKeyHint="next"
          />
        </Field>
        <label className="flex min-h-11 items-center gap-2 text-sm text-ink-muted">
          <Checkbox name="isDecisionMaker" defaultChecked />
          Decision maker
        </label>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">3. School photos</h2>
        <PhotoPicker />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">4. What happened</h2>
        <Field
          label="Conversation"
          htmlFor="visitSummary"
          required
          error={err.visitSummary}
          hint="Interest, pain points, budget, who else decides"
        >
          <Textarea id="visitSummary" name="visitSummary" rows={5} required />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Current ERP" htmlFor="currentErp">
            <Input id="currentErp" name="currentErp" placeholder="e.g. Entab, Excel, none" />
          </Field>
          <Field label="Main objection" htmlFor="primaryObjection">
            <Input id="primaryObjection" name="primaryObjection" placeholder="Price, timing…" />
          </Field>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">5. Visit date &amp; next follow-up</h2>
        <Field label="Visited on" htmlFor="visitDay" error={err.visitedAt}>
          <Input id="visitDay" name="visitDay" type="date" defaultValue={today} max={today} />
        </Field>
        <Field label="Next follow-up" htmlFor="nextFollowUpLocal" required error={err.nextFollowUpAt}>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {FOLLOW_UP_PRESETS.map((p) => {
                const value = inDays(p.days)
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setFollowUp(value)}
                    aria-pressed={followUp === value}
                    className="min-h-9 rounded-full border border-line px-3 text-sm text-ink-muted aria-pressed:border-[var(--brand-500)] aria-pressed:bg-[var(--brand-50)] aria-pressed:text-[var(--brand-600)] aria-pressed:font-medium"
                  >
                    {p.label}
                  </button>
                )
              })}
            </div>
            <Input
              id="nextFollowUpLocal"
              type="datetime-local"
              required
              value={followUp}
              min={inDays(0, 0)}
              onChange={(e) => setFollowUp(e.target.value)}
            />
          </div>
        </Field>
        <Field label="Next action" htmlFor="nextAction" required error={err.nextAction}>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {NEXT_ACTIONS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setNextAction(a)}
                  aria-pressed={nextAction === a}
                  className="min-h-9 rounded-full border border-line px-3 text-sm text-ink-muted aria-pressed:border-[var(--brand-500)] aria-pressed:bg-[var(--brand-50)] aria-pressed:text-[var(--brand-600)] aria-pressed:font-medium"
                >
                  {a}
                </button>
              ))}
            </div>
            <Input
              id="nextAction"
              name="nextAction"
              required
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
            />
          </div>
        </Field>
      </section>

      <details className="rounded-[var(--radius-md)] border border-line px-3 py-2">
        <summary className="min-h-9 cursor-pointer py-1 text-sm font-medium text-ink-muted">More: source, stage, duplicates</summary>
        <div className="space-y-3 pb-2 pt-3">
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
          <label className="flex min-h-11 items-center gap-2 text-sm text-ink-muted">
            <Checkbox name="confirmDuplicate" />
            Create anyway if a similar school already exists
          </label>
        </div>
      </details>

      <div className="sticky bottom-0 -mx-4 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur sm:-mx-1 sm:px-1">
        <Button type="submit" loading={pending} block size="lg">
          Save visit
        </Button>
        <p className="mt-2 text-center text-xs text-ink-subtle">
          Saves the school, contact, visit, photos and follow-up in one go.
        </p>
      </div>
    </form>
  )
}
