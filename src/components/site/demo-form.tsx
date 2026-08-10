'use client'

import * as React from 'react'
import { AlertCircle, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

type Values = {
  name: string
  email: string
  phone: string
  school: string
  city: string
  country: string
  schoolType: string
  size: string
  interest: string
  contactPreference: string
  message: string
  consent: boolean
  website: string
}

const EMPTY: Values = {
  name: '',
  email: '',
  phone: '',
  school: '',
  city: '',
  country: 'India',
  schoolType: 'PRIVATE_SCHOOL',
  size: '300_1000',
  interest: 'EVERYTHING',
  contactPreference: 'PHONE',
  message: '',
  consent: false,
  website: '',
}

const SCHOOL_TYPES = [
  ['PRIVATE_SCHOOL', 'Private school'],
  ['INTERNATIONAL_SCHOOL', 'International school'],
  ['PRESCHOOL', 'Preschool'],
  ['K12', 'K-12'],
  ['SCHOOL_GROUP', 'School group'],
  ['OTHER', 'Other'],
] as const

const SIZES = [
  ['UNDER_300', 'Under 300'],
  ['300_1000', '300 – 1,000'],
  ['1000_3000', '1,000 – 3,000'],
  ['3000_10000', '3,000 – 10,000'],
  ['OVER_10000', 'More than 10,000'],
] as const

const INTERESTS = [
  ['EVERYTHING', 'The whole system'],
  ['STUDENT_RECORDS', 'Student records and academics'],
  ['FEES', 'Fees and finance'],
  ['TRANSPORT', 'Transport'],
  ['COMMUNICATION', 'Parent communication'],
  ['OTHER', 'Something else'],
] as const

const CONTACT = [
  ['PHONE', 'Phone'],
  ['EMAIL', 'Email'],
  ['WHATSAPP', 'WhatsApp'],
] as const

/**
 * The demo request.
 *
 * School type and size are asked early and are the only two selects that
 * matter commercially — they decide who calls back and what gets shown. The
 * rest is deliberately short; a long form on this page costs more enquiries
 * than it qualifies.
 *
 * Validation runs on the client for immediacy and again on the server, which
 * is the one that counts.
 */
export function DemoForm() {
  const [values, setValues] = React.useState<Values>(EMPTY)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [status, setStatus] = React.useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  const [failure, setFailure] = React.useState<string | null>(null)

  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((current) => ({ ...current, [key]: value }))

  const validate = () => {
    const next: Record<string, string> = {}
    if (values.name.trim().length < 2) next.name = 'Please tell us your name'
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email.trim())) next.email = 'Please check this email address'
    if (values.phone.trim().length < 6) next.phone = 'Please include a phone number'
    if (values.school.trim().length < 2) next.school = 'Please tell us the name of your school'
    if (!values.consent) next.consent = 'Please confirm we may contact you'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!validate()) return

    setStatus('sending')
    setFailure(null)

    try {
      const response = await fetch('/api/v1/site/demo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...values,
          city: values.city || undefined,
          country: values.country || undefined,
          message: values.message || undefined,
        }),
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null
        throw new Error(body?.error?.message ?? 'That did not send')
      }

      setStatus('sent')
      // Fires only when a request genuinely lands, so the number in analytics
      // matches the number in the queue.
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('schoolos:demo-requested'))
      }
    } catch (error) {
      setStatus('failed')
      setFailure(error instanceof Error ? error.message : 'That did not send')
    }
  }

  if (status === 'sent') {
    return (
      <div className="rounded-xl border border-[var(--rule)] bg-white p-8">
        <span className="grid size-11 place-items-center rounded-full bg-[color-mix(in_srgb,var(--emerald)_14%,transparent)] text-[var(--emerald)]">
          <Check className="size-5" aria-hidden />
        </span>
        <h2 className="mt-5 text-[24px] font-semibold text-[var(--text)]">
          Thank you — we have it.
        </h2>
        <p className="muted mt-3 text-[17px] leading-[1.6]">
          Someone will contact {values.name.split(' ')[0]} by{' '}
          {values.contactPreference === 'PHONE'
            ? 'phone'
            : values.contactPreference === 'WHATSAPP'
              ? 'WhatsApp'
              : 'email'}{' '}
          within one working day to arrange a time.
        </p>
        <p className="subtle mt-4 text-[15px]">
          Before the call it helps to know what you use today for fees and attendance, and roughly
          how many students and staff you have. If anything changes, reply to the confirmation and
          we will pick it up.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="rounded-xl border border-[var(--rule)] bg-white p-6 sm:p-8">
      {status === 'failed' ? (
        <div
          role="alert"
          className="mb-6 flex items-start gap-2.5 rounded-lg border border-[color-mix(in_srgb,var(--coral)_35%,transparent)] bg-[color-mix(in_srgb,var(--coral)_8%,transparent)] px-4 py-3"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-[var(--coral)]" aria-hidden />
          <div className="text-[15px] text-[var(--coral)]">
            <p>{failure}</p>
            <p className="mt-1 text-[var(--text-muted)]">
              You can also write to us and we will reply the same way.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Your name" required error={errors.name} htmlFor="name">
          <Input id="name" value={values.name} onChange={(v) => set('name', v)} autoComplete="name" />
        </Field>
        <Field label="Work email" required error={errors.email} htmlFor="email">
          <Input id="email" type="email" value={values.email} onChange={(v) => set('email', v)} autoComplete="email" />
        </Field>
        <Field label="Phone" required error={errors.phone} htmlFor="phone">
          <Input id="phone" type="tel" value={values.phone} onChange={(v) => set('phone', v)} autoComplete="tel" />
        </Field>
        <Field label="School or institution" required error={errors.school} htmlFor="school">
          <Input id="school" value={values.school} onChange={(v) => set('school', v)} autoComplete="organization" />
        </Field>
        <Field label="City" htmlFor="city">
          <Input id="city" value={values.city} onChange={(v) => set('city', v)} autoComplete="address-level2" />
        </Field>
        <Field label="Country" htmlFor="country">
          <Input id="country" value={values.country} onChange={(v) => set('country', v)} autoComplete="country-name" />
        </Field>

        <Field label="Type of school" required htmlFor="schoolType">
          <Select id="schoolType" value={values.schoolType} onChange={(v) => set('schoolType', v)} options={SCHOOL_TYPES} />
        </Field>
        <Field label="Number of students" required htmlFor="size">
          <Select id="size" value={values.size} onChange={(v) => set('size', v)} options={SIZES} />
        </Field>
        <Field label="Most interested in" htmlFor="interest">
          <Select id="interest" value={values.interest} onChange={(v) => set('interest', v)} options={INTERESTS} />
        </Field>
        <Field label="Best way to reach you" htmlFor="contactPreference">
          <Select
            id="contactPreference"
            value={values.contactPreference}
            onChange={(v) => set('contactPreference', v)}
            options={CONTACT}
          />
        </Field>

        <div className="sm:col-span-2">
          <Field
            label="Anything you would like us to cover"
            htmlFor="message"
            hint="What you use today, and what it does badly, is the most useful thing you can tell us."
          >
            <textarea
              id="message"
              value={values.message}
              onChange={(event) => set('message', event.target.value)}
              rows={4}
              className="w-full rounded-lg border border-[var(--rule-strong)] bg-white px-3 py-2.5 text-[16px] text-[var(--text)] outline-none transition-colors focus:border-[var(--indigo)]"
            />
          </Field>
        </div>
      </div>

      {/* Honeypot. Off-screen rather than display:none, which some bots skip. */}
      <div aria-hidden className="absolute left-[-9999px] top-[-9999px]">
        <label htmlFor="website">Website</label>
        <input
          id="website"
          tabIndex={-1}
          autoComplete="off"
          value={values.website}
          onChange={(event) => set('website', event.target.value)}
        />
      </div>

      <label className="mt-6 flex items-start gap-3 text-[15px] text-[var(--text-muted)]">
        <input
          type="checkbox"
          checked={values.consent}
          onChange={(event) => set('consent', event.target.checked)}
          className="mt-1 size-4 rounded border-[var(--rule-strong)] accent-[var(--indigo)]"
        />
        <span>
          You may contact me about SchoolOS. We will not add you to a mailing list.
          {errors.consent ? (
            <span className="mt-1 block text-[14px] text-[var(--coral)]">{errors.consent}</span>
          ) : null}
        </span>
      </label>

      <button
        type="submit"
        disabled={status === 'sending'}
        className="mt-6 w-full rounded-lg bg-[var(--ink)] px-5 py-3.5 text-[16px] font-medium text-white transition-colors hover:bg-[var(--navy)] disabled:opacity-70 sm:w-auto"
      >
        {status === 'sending' ? 'Sending…' : 'Request a demo'}
      </button>
    </form>
  )
}

function Field({
  label,
  htmlFor,
  required,
  error,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  required?: boolean
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-[15px] font-medium text-[var(--text)]">
        {label}
        {required ? <span className="ml-0.5 text-[var(--coral)]">*</span> : null}
      </label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p className="mt-1.5 text-[14px] text-[var(--coral)]">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[14px] text-[var(--text-subtle)]">{hint}</p>
      ) : null}
    </div>
  )
}

const CONTROL =
  'w-full rounded-lg border border-[var(--rule-strong)] bg-white px-3 py-2.5 text-[16px] text-[var(--text)] outline-none transition-colors focus:border-[var(--indigo)]'

function Input({
  id,
  value,
  onChange,
  type = 'text',
  autoComplete,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  type?: string
  autoComplete?: string
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      autoComplete={autoComplete}
      onChange={(event) => onChange(event.target.value)}
      className={CONTROL}
    />
  )
}

function Select({
  id,
  value,
  onChange,
  options,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  options: readonly (readonly [string, string])[]
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn(CONTROL, 'appearance-none bg-[position:right_0.75rem_center] bg-no-repeat pr-9')}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%236b7791' stroke-width='1.5'%3E%3Cpath d='m4 6 4 4 4-4'/%3E%3C/svg%3E\")",
      }}
    >
      {options.map(([value_, label]) => (
        <option key={value_} value={value_}>
          {label}
        </option>
      ))}
    </select>
  )
}
