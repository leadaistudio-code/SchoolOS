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
  type CrmStage,
} from '@/lib/growth-crm'
import type { VoiceCaptureResult } from '@/server/modules/platform/growth/voice'

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

const CAPTURE_STAGES: CrmStage[] = ['PROSPECT', 'CONTACTED', 'MEETING_SCHEDULED', 'DEMO_COMPLETED', 'FOLLOW_UP']

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

export function FieldCaptureForm({ voice }: { voice?: VoiceCaptureResult | null }) {
  const [state, action, pending] = useActionState(captureFieldLeadAction, emptyFormState)
  const today = useMemo(() => dateInput(new Date()), [])
  const draft = voice?.draft
  const matches = voice?.matches ?? []
  const [existingId, setExistingId] = useState(() => matches.find((m) => m.likely)?.id ?? '')
  const existing = matches.find((m) => m.id === existingId)
  const [name, setName] = useState(() => existing?.name ?? draft?.schoolName ?? '')
  const [city, setCity] = useState(() => existing?.city ?? draft?.city ?? '')
  const [followUp, setFollowUp] = useState(() =>
    draft?.followUpDate ? `${draft.followUpDate}T${draft.followUpTime ?? '10:00'}` : inDays(1),
  )
  const [nextAction, setNextAction] = useState(draft?.nextAction ?? 'Follow-up call')
  const [stage, setStage] = useState<string>(() => existing?.stage ?? draft?.stage ?? 'CONTACTED')
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.error) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [state])

  function chooseSchool(id: string) {
    setExistingId(id)
    const match = matches.find((m) => m.id === id)
    setName(match?.name ?? draft?.schoolName ?? '')
    setCity(match?.city ?? draft?.city ?? '')
    setStage(match?.stage ?? draft?.stage ?? 'CONTACTED')
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set('visitedAt', visitIso(String(fd.get('visitDay') ?? '')))
    fd.set('nextFollowUpAt', toIso(followUp))
    fd.delete('visitDay')
    startTransition(() => action(fd))
  }

  const err = state.fieldErrors
  const stageOptions = existing && !CAPTURE_STAGES.includes(existing.stage) ? [existing.stage, ...CAPTURE_STAGES] : CAPTURE_STAGES
  const visitDay = draft?.visitDate && draft.visitDate <= today ? draft.visitDate : today

  return (
    <form ref={formRef} onSubmit={onSubmit} className="scroll-mt-20 space-y-6" noValidate>
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}

      {voice ? (
        <div className="space-y-2">
          <Notice tone="info">
            Filled from your voice note. Check every field, correct anything wrong, then tap <b>Confirm &amp; save</b>.
          </Notice>
          {draft?.missing?.length ? (
            <Notice tone="warning">Not mentioned in the note: {draft.missing.join(', ')}. Please fill these in.</Notice>
          ) : null}
          <details className="rounded-[var(--radius-md)] border border-line px-3 py-2 text-sm">
            <summary className="cursor-pointer py-1 font-medium text-ink-muted">What we heard</summary>
            <p className="whitespace-pre-wrap pb-2 pt-1 text-ink-muted">{voice.transcript}</p>
          </details>
        </div>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">1. School</h2>
        {matches.length ? (
          <fieldset className="space-y-2 rounded-[var(--radius-md)] border border-line p-3">
            <legend className="px-1 text-sm font-medium text-ink">Is this a school already in the CRM?</legend>
            {matches.map((m) => (
              <label key={m.id} className="flex min-h-10 items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="schoolChoice"
                  className="mt-1"
                  checked={existingId === m.id}
                  onChange={() => chooseSchool(m.id)}
                />
                <span>
                  <span className="font-medium text-ink">{m.name}</span>
                  <span className="text-ink-muted">
                    {m.city ? ` · ${m.city}` : ''} · {m.stageLabel}
                  </span>
                </span>
              </label>
            ))}
            <label className="flex min-h-10 items-center gap-2 text-sm">
              <input type="radio" name="schoolChoice" checked={!existingId} onChange={() => chooseSchool('')} />
              <span className="font-medium text-ink">No, add as a new school</span>
            </label>
          </fieldset>
        ) : null}
        <input type="hidden" name="existingSchoolId" value={existingId} />
        <Field label="School name" htmlFor="name" required error={err.name}>
          <Input
            id="name"
            name="name"
            required
            autoComplete="organization"
            enterKeyHint="next"
            value={name}
            readOnly={!!existing}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Area / city" htmlFor="city" required error={err.city}>
          <Input
            id="city"
            name="city"
            required
            autoComplete="address-level2"
            placeholder="e.g. Saket, New Delhi"
            enterKeyHint="next"
            value={city}
            readOnly={!!existing}
            onChange={(e) => setCity(e.target.value)}
          />
        </Field>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">2. Who you spoke with</h2>
        <Field label="Name" htmlFor="contactName" required error={err.contactName}>
          <Input
            id="contactName"
            name="contactName"
            required
            autoComplete="name"
            enterKeyHint="next"
            defaultValue={draft?.contactName}
          />
        </Field>
        <Field label="Designation" htmlFor="contactDesignation">
          <Select id="contactDesignation" name="contactDesignation" defaultValue={draft?.contactDesignation ?? 'PRINCIPAL'}>
            {CONTACT_ROLES.map((role) => (
              <option key={role} value={role}>
                {CONTACT_ROLE_LABELS[role]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Contact number"
          htmlFor="contactMobile"
          required={!existing}
          error={err.contactMobile}
          hint={existing ? 'Optional for a school already in the CRM' : undefined}
        >
          <Input
            id="contactMobile"
            name="contactMobile"
            type="tel"
            required={!existing}
            inputMode="tel"
            autoComplete="tel"
            placeholder="98xxxxxxxx"
            enterKeyHint="next"
            defaultValue={draft?.contactMobile}
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
            defaultValue={draft?.contactEmail}
          />
        </Field>
        <label className="flex min-h-11 items-center gap-2 text-sm text-ink-muted">
          <Checkbox name="isDecisionMaker" defaultChecked={draft?.isDecisionMaker ?? true} />
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
          <Textarea id="visitSummary" name="visitSummary" rows={5} required defaultValue={draft?.visitSummary} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Current ERP" htmlFor="currentErp">
            <Input id="currentErp" name="currentErp" placeholder="e.g. Entab, Excel, none" defaultValue={draft?.currentErp} />
          </Field>
          <Field label="Main objection" htmlFor="primaryObjection">
            <Input
              id="primaryObjection"
              name="primaryObjection"
              placeholder="Price, timing…"
              defaultValue={draft?.primaryObjection}
            />
          </Field>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">5. Visit date &amp; next follow-up</h2>
        <Field label="Visited on" htmlFor="visitDay" error={err.visitedAt}>
          <Input id="visitDay" name="visitDay" type="date" defaultValue={visitDay} max={today} />
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

      <details
        className="rounded-[var(--radius-md)] border border-line px-3 py-2"
        open={!!voice && !!draft?.stage && draft.stage !== 'CONTACTED'}
      >
        <summary className="min-h-9 cursor-pointer py-1 text-sm font-medium text-ink-muted">More: source, stage, duplicates</summary>
        <div className="space-y-3 pb-2 pt-3">
          <Field label="How you found them" htmlFor="leadSource">
            <Select id="leadSource" name="leadSource" defaultValue={draft?.leadSource ?? 'SCHOOL_VISIT'}>
              {LEAD_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {LEAD_SOURCE_LABELS[source]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Pipeline stage" htmlFor="stage" hint="Usually Contacted after a visit">
            <Select id="stage" name="stage" value={stage} onChange={(e) => setStage(e.target.value)}>
              {stageOptions.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
          {!existing ? (
            <label className="flex min-h-11 items-center gap-2 text-sm text-ink-muted">
              <Checkbox name="confirmDuplicate" />
              Create anyway if a similar school already exists
            </label>
          ) : null}
        </div>
      </details>

      <div className="sticky bottom-0 -mx-4 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur sm:-mx-1 sm:px-1">
        <Button type="submit" loading={pending} block size="lg">
          {voice ? 'Confirm & save' : 'Save visit'}
        </Button>
        <p className="mt-2 text-center text-xs text-ink-subtle">
          {existing
            ? `Adds this visit, contact, photos and follow-up to ${existing.name}.`
            : 'Saves the school, contact, visit, photos and follow-up in one go.'}
        </p>
      </div>
    </form>
  )
}
